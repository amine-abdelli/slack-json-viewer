import { localeFromRequest, withLocale } from "@/lib/i18n/server";
import { CredentialJar } from "@/lib/server/credentials";
import { status } from "@/lib/server/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports what the bridge can do, and which workspaces this browser is signed in to. */
export async function GET(request: Request) {
  const jar = new CredentialJar(request);
  const body = withLocale(localeFromRequest(request), () => status(jar));
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
