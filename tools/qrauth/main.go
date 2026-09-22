// Command qrauth performs the non-interactive half of slackdump's
// "Sign in on mobile" (QR code) authentication flow.
//
// slackdump only exposes this flow through its interactive terminal UI, so it
// cannot be driven from a web front end. This helper does the same job from
// the command line: given a workspace name and the QR code image, it returns
// a Slack client token and its `d` cookie as JSON on stdout.
//
//	qrauth -workspace acme -qr -   # reads the data URL from stdin
//	{"token":"xoxc-…","cookie":"xoxd-…","workspace":"acme"}
//
// How it works, and why it does not use slackauth's own QRAuth:
//
//   - The QR code encodes a one-shot sign-in link, not something to scan with
//     a phone. Opening it in a browser establishes the session.
//   - slackauth waits for the full Slack web client to boot and then snatches
//     the token out of an `api.features` request. That depends on an
//     interstitial being dismissed and a heavy SPA loading, and it hangs
//     forever when either does not happen.
//   - The session `d` cookie, however, is set as soon as the link is consumed.
//     With it, the token can be read straight off `/ssb/redirect` over plain
//     HTTP — the same trick slackdump uses in auth.NewCookieOnlyAuth. So this
//     waits for the cookie, then drops the browser.
//
// Diagnostics go to stderr so the caller can stream them as progress.
package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/caiguanhao/readqr"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
)

const (
	// The sign-in link lands on an interstitial that tries to hand off to the
	// Slack desktop app; this is its "open in browser" button.
	redirectButton = `[data-qa="ssb_redirect_open_in_browser"]`

	userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
		"(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

	pollInterval = 500 * time.Millisecond

	// How often to report where the browser actually is while waiting. The
	// browser is invisible (it runs on a virtual display in the container), so
	// this is the only window onto what Slack is showing.
	reportInterval = 5 * time.Second
)

// The workspace page embeds the client token in its bootstrap payload.
var tokenRe = regexp.MustCompile(`"api_token":"([^"]+)"`)

type result struct {
	Token     string `json:"token"`
	Cookie    string `json:"cookie"`
	Workspace string `json:"workspace"`
}

func main() {
	var (
		workspace = flag.String("workspace", "", "Slack workspace name (the subdomain, e.g. \"acme\")")
		qrFile    = flag.String("qr", "-", "file holding the QR code image data URL, or \"-\" for stdin")
		timeout   = flag.Duration("timeout", 2*time.Minute, "overall timeout for the login flow")
		debugDir  = flag.String("debug-dir", os.TempDir(), "where to write a screenshot if the login fails; empty to disable")
	)
	flag.Parse()

	if err := run(*workspace, *qrFile, *timeout, *debugDir); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func logf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
}

func run(rawWorkspace, qrFile string, timeout time.Duration, debugDir string) error {
	workspace := normaliseWorkspace(rawWorkspace)
	if workspace == "" {
		return errors.New("workspace is required")
	}
	base := "https://" + workspace + ".slack.com"

	loginURL, err := readLoginURL(qrFile)
	if err != nil {
		return err
	}
	// Where the QR code actually points is the first thing worth knowing when a
	// login goes nowhere; the query string is the credential, so it is dropped.
	logf("QR code points at %s", redactURL(loginURL))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Fail fast and clearly when the workspace simply is not reachable from
	// here; otherwise the browser sits on a blank page until the deadline and
	// the error says nothing useful.
	logf("checking %s is reachable", base)
	if err := checkReachable(ctx, base); err != nil {
		return err
	}

	logf("starting browser")
	browser, closeBrowser, err := startBrowser(ctx)
	if err != nil {
		return err
	}
	defer closeBrowser()

	page, err := browser.Page(proto.TargetCreateTarget{})
	if err != nil {
		return fmt.Errorf("opening a tab: %w", err)
	}

	logf("opening the sign-in link from the QR code")
	if err := page.Navigate(loginURL); err != nil {
		return fmt.Errorf("opening the sign-in link: %w", err)
	}

	cookie, err := waitForSessionCookie(ctx, browser, page)
	if err != nil {
		dumpDiagnostics(page, debugDir)
		return err
	}

	logf("signed in, reading the API token")
	token, err := tokenFromCookie(ctx, base, cookie)
	if err != nil {
		return err
	}

	return json.NewEncoder(os.Stdout).Encode(result{
		Token:     token,
		Cookie:    cookie,
		Workspace: workspace,
	})
}

/* -------------------------------------------------------------------------- */
/*  QR code                                                                    */
/* -------------------------------------------------------------------------- */

// readLoginURL reads the pasted data URL and decodes the sign-in link out of
// the QR code it contains.
func readLoginURL(name string) (string, error) {
	var (
		raw []byte
		err error
	)
	if name == "-" || name == "" {
		raw, err = io.ReadAll(io.LimitReader(os.Stdin, 8<<20))
	} else {
		raw, err = os.ReadFile(name)
	}
	if err != nil {
		return "", fmt.Errorf("reading QR code data: %w", err)
	}

	data := strings.TrimSpace(string(raw))
	comma := strings.Index(data, ",")
	if !strings.HasPrefix(data, "data:image/") || comma < 0 {
		return "", errors.New("QR code data must be a data URL starting with \"data:image/\"")
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(data[comma+1:]))
	if err != nil {
		return "", fmt.Errorf("decoding the QR code image: %w", err)
	}
	img, err := png.Decode(bytes.NewReader(decoded))
	if err != nil {
		return "", fmt.Errorf("decoding the QR code image: %w", err)
	}
	link, err := readqr.DecodeImage(img)
	if err != nil {
		return "", fmt.Errorf(
			"no QR code found in that image — copy the QR code itself, not the page around it (%w)", err)
	}
	if !strings.HasPrefix(link, "https://") {
		return "", fmt.Errorf("the QR code does not contain a sign-in link (got %q)", truncate(link, 80))
	}
	return link, nil
}

/* -------------------------------------------------------------------------- */
/*  Browser                                                                    */
/* -------------------------------------------------------------------------- */

func startBrowser(ctx context.Context) (*rod.Browser, func(), error) {
	// Headful by default: Slack serves a different experience to obviously
	// automated browsers. QRAUTH_HEADLESS=1 is an escape hatch for a machine
	// where no display can be arranged.
	headless := os.Getenv("QRAUTH_HEADLESS") == "1"
	l := launcher.New().Headless(headless).Leakless(true).Devtools(false)
	if bin := os.Getenv("CHROME_BIN"); bin != "" {
		l = l.Bin(bin)
	}
	controlURL, err := l.Context(ctx).Launch()
	if err != nil {
		return nil, nil, fmt.Errorf(
			"could not start a browser (DISPLAY=%q): a real display is required, "+
				"so a headless machine needs Xvfb: %w", os.Getenv("DISPLAY"), err)
	}
	browser := rod.New().Context(ctx).ControlURL(controlURL)
	if err := browser.Connect(); err != nil {
		l.Cleanup()
		return nil, nil, fmt.Errorf("connecting to the browser: %w", err)
	}
	return browser, func() {
		_ = browser.Close()
		l.Cleanup()
	}, nil
}

// waitForSessionCookie polls until Slack has set the `d` session cookie, which
// happens as soon as the sign-in link is consumed — well before the web client
// finishes loading.
func waitForSessionCookie(ctx context.Context, browser *rod.Browser, page *rod.Page) (string, error) {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	clicked := false
	lastReport := time.Time{}
	for {
		if value := sessionCookie(browser); value != "" {
			return value, nil
		}
		info, infoErr := page.Info()
		if infoErr == nil && strings.Contains(info.Title, "Link expired") {
			return "", errors.New(
				"the sign-in link has expired — reopen \"Sign in on mobile\" in Slack and copy a fresh QR code")
		}
		// Say out loud where the browser ended up, so a stuck login is visible
		// while it happens instead of only at the deadline.
		if infoErr == nil && time.Since(lastReport) >= reportInterval {
			lastReport = time.Now()
			logf("waiting for sign-in — page: %q at %s", info.Title, redactURL(info.URL))
		}
		// Dismiss the "open in the Slack app" interstitial once, if it shows up.
		if !clicked {
			if el, err := page.Timeout(time.Second).Element(redirectButton); err == nil && el != nil {
				if err := el.Click(proto.InputMouseButtonLeft, 1); err == nil {
					logf("dismissed the \"open in the app\" prompt")
					clicked = true
				}
			}
		}
		select {
		case <-ctx.Done():
			return "", fmt.Errorf("timed out waiting for Slack to complete the sign-in: %w", ctx.Err())
		case <-ticker.C:
		}
	}
}

func sessionCookie(browser *rod.Browser) string {
	cookies, err := browser.GetCookies()
	if err != nil {
		return ""
	}
	for _, c := range cookies {
		if c.Name == "d" && strings.HasPrefix(c.Value, "xoxd-") {
			return c.Value
		}
	}
	return ""
}

// dumpDiagnostics records where the browser actually ended up, which is the
// only way to tell a blocked network from a changed Slack page.
func dumpDiagnostics(page *rod.Page, dir string) {
	if info, err := page.Info(); err == nil {
		// Redacted: this line is surfaced in the app's error box, and a sign-in
		// URL's query string is a credential.
		logf("last page: %q — %s", info.Title, redactURL(info.URL))
	}
	if dir == "" {
		return
	}
	shot, err := page.Timeout(10*time.Second).Screenshot(false, nil)
	if err != nil {
		return
	}
	name := filepath.Join(dir, fmt.Sprintf("qrauth-%d.png", time.Now().Unix()))
	if err := os.WriteFile(name, shot, 0o600); err == nil {
		logf("screenshot of the stuck page written to %s", name)
	}
}

/* -------------------------------------------------------------------------- */
/*  HTTP                                                                       */
/* -------------------------------------------------------------------------- */

func checkReachable(ctx context.Context, base string) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, base+"/", nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", userAgent)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf(
			"cannot reach %s — check the workspace name and this machine's network access: %w", base, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("no Slack workspace at %s — check the subdomain", base)
	}
	return nil
}

// tokenFromCookie reads the client token off the workspace bootstrap page,
// which is what slackdump's auth.NewCookieOnlyAuth does.
func tokenFromCookie(ctx context.Context, base, dCookie string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/ssb/redirect", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Cookie", "d="+dCookie)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("requesting the API token: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("requesting the API token: HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return "", fmt.Errorf("reading the API token: %w", err)
	}
	m := tokenRe.FindSubmatch(body)
	if m == nil {
		return "", errors.New("signed in, but no API token was found on the workspace page")
	}
	return string(m[1]), nil
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

// normaliseWorkspace accepts what a user is likely to paste — "acme",
// "acme.slack.com", "https://acme.slack.com/" — and returns the bare
// subdomain.
func normaliseWorkspace(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	s = strings.TrimPrefix(strings.TrimPrefix(s, "https://"), "http://")
	if i := strings.IndexAny(s, "/?#"); i >= 0 {
		s = s[:i]
	}
	return strings.TrimSuffix(s, ".slack.com")
}

// redactURL keeps the part of a URL that identifies the page and drops the
// query string, which on a sign-in link is a credential.
func redactURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return "(unparseable URL)"
	}
	out := u.Scheme + "://" + u.Host + u.Path
	if u.RawQuery != "" || u.Fragment != "" {
		out += "?…"
	}
	return truncate(out, 160)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
