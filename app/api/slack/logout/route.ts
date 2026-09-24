import { NextResponse } from "next/server";

import { localeFromRequest, sm, withLocale } from "@/lib/i18n/server";
import { CredentialJar } from "@/lib/server/credentials";
import { BridgeError, logout } from "@/lib/server/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Forgets this browser's credentials for a workspace (clears its cookie). */
export async function POST(request: Request) {
  return withLocale(localeFromRequest(request), () => handle(request));
}

async function handle(request: Request) {
  let workspace: unknown;
  try {
    ({ workspace } = await request.json());
  } catch {
    return NextResponse.json({ error: sm().invalidBody }, { status: 400 });
  }
  if (typeof workspace !== "string") {
    return NextResponse.json({ error: sm().invalidRequest }, { status: 400 });
  }
  const jar = new CredentialJar(request);
  try {
    logout(jar, workspace);
  } catch (err) {
    const message = err instanceof BridgeError ? err.message : sm().logoutFailed;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const response = NextResponse.json({ ok: true });
  for (const cookie of jar.setCookieHeaders()) response.headers.append("set-cookie", cookie);
  return response;
}
