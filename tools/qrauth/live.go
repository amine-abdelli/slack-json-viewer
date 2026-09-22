package main

// The live view: the browser this helper drives runs on the server, where
// nobody can see it. Some sign-ins cannot finish without a person — the QR
// link of a workspace behind SSO lands on the company's identity provider —
// so the helper streams what the page shows and accepts clicks and keystrokes
// back.
//
// Protocol, one line each:
//
//	stderr  "@@frame <base64 JPEG>"            the page, whenever it changes
//	stdin   {"t":"click","x":640,"y":400}      coordinates in the viewport
//	stdin   {"t":"text","v":"hello"}           inserted at the focus
//	stdin   {"t":"key","k":"Enter"}            one of `liveKeys`
//	stdin   {"t":"scroll","dy":300}
//
// Keystrokes are never logged: they may be a password.

import (
	"bufio"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/input"
	"github.com/go-rod/rod/lib/proto"
)

const (
	// The page is rendered at a fixed size, so a click on the preview maps to
	// the same point in the browser whatever size the preview is shown at.
	viewportWidth  = 1280
	viewportHeight = 800

	framePrefix   = "@@frame "
	frameInterval = 400 * time.Millisecond
	frameQuality  = 60
)

var liveKeys = map[string]input.Key{
	"Enter":      input.Enter,
	"Tab":        input.Tab,
	"Backspace":  input.Backspace,
	"Delete":     input.Delete,
	"Escape":     input.Escape,
	"ArrowUp":    input.ArrowUp,
	"ArrowDown":  input.ArrowDown,
	"ArrowLeft":  input.ArrowLeft,
	"ArrowRight": input.ArrowRight,
	"Home":       input.Home,
	"End":        input.End,
}

type liveCommand struct {
	T  string  `json:"t"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
	DY float64 `json:"dy"`
	V  string  `json:"v"`
	K  string  `json:"k"`
}

type liveView struct {
	page  *rod.Page
	nudge chan struct{}
	last  [sha1.Size]byte
}

func newLiveView(page *rod.Page) *liveView {
	return &liveView{page: page, nudge: make(chan struct{}, 1)}
}

// setViewport fixes the page size; call it before navigating.
func setViewport(page *rod.Page) error {
	return page.SetViewport(&proto.EmulationSetDeviceMetricsOverride{
		Width:             viewportWidth,
		Height:            viewportHeight,
		DeviceScaleFactor: 1,
	})
}

// poke asks for a frame now rather than at the next tick — after an input,
// the person waits for the page to react.
func (l *liveView) poke() {
	select {
	case l.nudge <- struct{}{}:
	default:
	}
}

// streamFrames sends a frame whenever the page looks different, until ctx ends.
func (l *liveView) streamFrames(ctx context.Context) {
	ticker := time.NewTicker(frameInterval)
	defer ticker.Stop()
	for {
		l.sendFrame()
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-l.nudge:
			// Let the page react to the input before looking at it.
			time.Sleep(150 * time.Millisecond)
		}
	}
}

func (l *liveView) sendFrame() {
	quality := frameQuality
	shot, err := l.page.Timeout(3*time.Second).Screenshot(false, &proto.PageCaptureScreenshot{
		Format:           proto.PageCaptureScreenshotFormatJpeg,
		Quality:          &quality,
		OptimizeForSpeed: true,
	})
	if err != nil || len(shot) == 0 {
		return // navigating; the next tick will catch up
	}
	sum := sha1.Sum(shot)
	if sum == l.last {
		return
	}
	l.last = sum
	emit(framePrefix + base64.StdEncoding.EncodeToString(shot))
}

// readCommands applies the inputs arriving on stdin until it closes.
func (l *liveView) readCommands(ctx context.Context, in *bufio.Reader) {
	for {
		line, err := in.ReadString('\n')
		if trimmed := strings.TrimSpace(line); trimmed != "" && ctx.Err() == nil {
			var cmd liveCommand
			if jsonErr := json.Unmarshal([]byte(trimmed), &cmd); jsonErr != nil {
				logf("live view: ignored a malformed input")
			} else if applyErr := l.apply(cmd); applyErr != nil {
				logf("live view: %v", applyErr)
			}
			l.poke()
		}
		if err != nil {
			return
		}
	}
}

func (l *liveView) apply(cmd liveCommand) error {
	page := l.page.Timeout(5 * time.Second)
	switch cmd.T {
	case "click":
		if !inViewport(cmd.X, cmd.Y) {
			return fmt.Errorf("click outside the page at %.0f,%.0f", cmd.X, cmd.Y)
		}
		if err := page.Mouse.MoveTo(proto.Point{X: cmd.X, Y: cmd.Y}); err != nil {
			return fmt.Errorf("click failed: %w", err)
		}
		if err := page.Mouse.Click(proto.InputMouseButtonLeft, 1); err != nil {
			return fmt.Errorf("click failed: %w", err)
		}
	case "text":
		if cmd.V == "" {
			return nil
		}
		if err := page.InsertText(cmd.V); err != nil {
			return fmt.Errorf("typing failed: %w", err)
		}
	case "key":
		key, ok := liveKeys[cmd.K]
		if !ok {
			return fmt.Errorf("unsupported key %q", cmd.K)
		}
		if err := page.Keyboard.Type(key); err != nil {
			return fmt.Errorf("key press failed: %w", err)
		}
	case "scroll":
		dy := math.Max(-2000, math.Min(2000, cmd.DY))
		if err := page.Mouse.Scroll(0, dy, 1); err != nil {
			return fmt.Errorf("scroll failed: %w", err)
		}
	default:
		return fmt.Errorf("unknown input %q", cmd.T)
	}
	return nil
}

func inViewport(x, y float64) bool {
	return x >= 0 && y >= 0 && x <= viewportWidth && y <= viewportHeight
}
