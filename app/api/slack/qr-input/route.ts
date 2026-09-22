import { NextResponse } from "next/server";

import { localeFromRequest, sm, withLocale } from "@/lib/i18n/server";
import { BridgeError, sendQrInput } from "@/lib/server/slack";
import { resolveSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Forwards a click or a keystroke to the browser of a QR sign-in in progress
 * (see `sendQrInput`). Only the session that started the sign-in can reach it.
 * The body may hold a password: it is never logged.
 */
export async function POST(request: Request) {
  return withLocale(localeFromRequest(request), () => handle(request));
}

async function handle(request: Request) {
  const session = resolveSession(request);
  if (session.isNew) {
    return NextResponse.json({ error: sm().liveGone }, { status: 404 });
  }
  let body: { id?: unknown; input?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: sm().invalidBody }, { status: 400 });
  }
  try {
    sendQrInput(session.id, body.id, body.input);
  } catch (err) {
    const message = err instanceof BridgeError ? err.message : sm().unexpectedError;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
