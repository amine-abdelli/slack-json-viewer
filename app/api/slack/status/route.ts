import { status } from "@/lib/server/slack";
import {
  isSecureRequest,
  resolveSession,
  sessionCookieHeader,
  sweepExpiredSessions,
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports what the bridge can do, and which workspaces the caller is signed in to. */
export async function GET(request: Request) {
  void sweepExpiredSessions();

  const session = resolveSession(request);
  const body = await status(session.id);

  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  if (session.isNew) {
    headers.append("set-cookie", sessionCookieHeader(session, isSecureRequest(request)));
  }
  return new Response(JSON.stringify(body), { headers });
}
