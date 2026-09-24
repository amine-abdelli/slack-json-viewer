import { NextResponse } from "next/server";

import { localeFromRequest, sm, withLocale } from "@/lib/i18n/server";
import { CredentialJar } from "@/lib/server/credentials";
import { assertWorkspace, BridgeError, credentialsFor } from "@/lib/server/slack";
import { isSlackFileUrl, MAX_IMAGE_BYTES } from "@/lib/slack/screenshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Overridable so tests can point at a stub. */
const FILES_ORIGIN = process.env.SLACK_FILES_ORIGIN;

/**
 * Downloads one image attached to a message (a screenshot) with the
 * credentials this browser signed in with, for the copy the library keeps.
 *
 * Only Slack's file hosts, only images, at most 8 MB — this is not a proxy.
 * A 429 from Slack is passed on with its `Retry-After`.
 */
export async function POST(request: Request) {
  return withLocale(localeFromRequest(request), () => handle(request));
}

async function handle(request: Request) {
  let workspace: unknown;
  let url: unknown;
  try {
    ({ workspace, url } = await request.json());
  } catch {
    return NextResponse.json({ error: sm().invalidBody }, { status: 400 });
  }
  if (typeof workspace !== "string" || typeof url !== "string" || !isSlackFileUrl(url)) {
    return NextResponse.json({ error: sm().invalidRequest }, { status: 400 });
  }

  let creds;
  try {
    creds = credentialsFor(new CredentialJar(request), assertWorkspace(workspace));
  } catch (err) {
    const message = err instanceof BridgeError ? err.message : sm().unexpectedError;
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const target = FILES_ORIGIN ? FILES_ORIGIN + new URL(url).pathname : url;
  let res: Response;
  try {
    res = await fetch(target, {
      headers: { authorization: `Bearer ${creds.token}`, cookie: `d=${creds.cookie}` },
      signal: request.signal,
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
  if (!res.ok) {
    const headers = new Headers();
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) headers.set("retry-after", retryAfter);
    return new NextResponse(null, { status: res.status === 429 ? 429 : 502, headers });
  }
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  // Signed out, Slack answers with its sign-in page rather than the image.
  if (!type.startsWith("image/")) return new NextResponse(null, { status: 415 });
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_IMAGE_BYTES) return new NextResponse(null, { status: 413 });
  return new NextResponse(body, {
    headers: { "content-type": type, "cache-control": "private, no-store" },
  });
}
