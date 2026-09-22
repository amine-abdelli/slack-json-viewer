import { NextResponse } from "next/server";

import { BridgeError, logout } from "@/lib/server/slack";
import { resolveSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Forgets the credentials this session stored for a workspace. */
export async function POST(request: Request) {
  const session = resolveSession(request);
  if (session.isNew) {
    // Nothing was ever stored for a caller we have not seen before.
    return NextResponse.json({ ok: true });
  }

  let workspace: unknown;
  try {
    ({ workspace } = await request.json());
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (typeof workspace !== "string") {
    return NextResponse.json({ error: "« workspace » est requis." }, { status: 400 });
  }
  try {
    await logout(session.id, workspace);
  } catch (err) {
    const message = err instanceof BridgeError ? err.message : "Échec de la déconnexion.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
