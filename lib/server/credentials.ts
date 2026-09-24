/**
 * Keeps a visitor's Slack credentials — in their own browser.
 *
 * Each signed-in workspace is one httpOnly cookie, `lq_ws_<workspace>`, holding
 * the token and `d` cookie encrypted (AES-256-GCM) with a key derived from
 * `SLACK_VIEWER_SECRET`. The server keeps nothing between requests, so it runs
 * on a stateless host such as Vercel, and one visitor can never reach
 * another's workspace: each only ever sends their own cookies.
 */

import crypto from "node:crypto";

export interface SlackCredentials {
  /** `xoxc-…` client token, or another `xox…` token */
  token: string;
  /** the `d` cookie value, URL-encoded exactly as Slack set it */
  cookie: string;
}

const PREFIX = "lq_ws_";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** How long a sign-in lasts in the browser. */
const MAX_AGE_S = Number(process.env.SLACK_VIEWER_SESSION_TTL_HOURS ?? 12) * 60 * 60;

let key: Buffer | null = null;

/**
 * The encryption key: from `SLACK_VIEWER_SECRET` when set, otherwise from the
 * key made at build time (`next.config.ts`), shared by every route of the
 * deployment — sign-ins then last until the next deployment. The random last
 * resort only serves code run outside a Next build, such as tests.
 */
function encryptionKey(): Buffer {
  if (key) return key;
  const secret = process.env.SLACK_VIEWER_SECRET;
  const fallback = process.env.LOQUARIUM_BUILD_KEY;
  const material =
    secret && secret.length >= 16 ? secret : fallback ? `build:${fallback}` : null;
  key = material
    ? crypto.createHash("sha256").update(`loquarium-credentials:${material}`).digest()
    : crypto.randomBytes(32);
  return key;
}

function seal(creds: SlackCredentials): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(creds), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function open(value: string): SlackCredentials | null {
  try {
    const payload = Buffer.from(value, "base64url");
    if (payload.length <= IV_BYTES + TAG_BYTES) return null;
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), payload.subarray(0, IV_BYTES));
    decipher.setAuthTag(payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([
      decipher.update(payload.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plain) as Partial<SlackCredentials>;
    if (!parsed.token || typeof parsed.cookie !== "string") return null;
    return { token: parsed.token, cookie: parsed.cookie };
  } catch {
    // Another key (the secret changed) or a tampered value: not signed in.
    return null;
  }
}

/** True when the request arrived over TLS, directly or through a proxy. */
function isSecure(request: Request): boolean {
  if (request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The credentials a request carries, and the cookies its response must set.
 * One per request.
 */
export class CredentialJar {
  private readonly stored = new Map<string, string>();
  private readonly outgoing: string[] = [];
  private readonly secure: boolean;

  constructor(request: Request) {
    this.secure = isSecure(request);
    for (const part of (request.headers.get("cookie") ?? "").split(";")) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      const name = part.slice(0, eq).trim();
      if (name.startsWith(PREFIX) && name.length > PREFIX.length) {
        this.stored.set(name.slice(PREFIX.length), part.slice(eq + 1).trim());
      }
    }
  }

  /** Workspaces this browser is signed in to. */
  workspaces(): string[] {
    return [...this.stored.keys()].filter((w) => this.get(w)).sort();
  }

  get(workspace: string): SlackCredentials | null {
    const value = this.stored.get(workspace);
    return value ? open(value) : null;
  }

  set(workspace: string, creds: SlackCredentials): void {
    const value = seal(creds);
    this.stored.set(workspace, value);
    this.outgoing.push(this.cookie(workspace, value, MAX_AGE_S));
  }

  delete(workspace: string): void {
    this.stored.delete(workspace);
    this.outgoing.push(this.cookie(workspace, "", 0));
  }

  /** `Set-Cookie` values to add to the response. */
  setCookieHeaders(): string[] {
    return this.outgoing;
  }

  private cookie(workspace: string, value: string, maxAge: number): string {
    const parts = [
      `${PREFIX}${workspace}=${value}`,
      "Path=/api/slack",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${maxAge}`,
    ];
    if (this.secure) parts.push("Secure");
    return parts.join("; ");
  }
}
