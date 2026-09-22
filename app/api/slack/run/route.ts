import {
  authenticateWithQr,
  authenticateWithToken,
  BridgeError,
  dumpChannel,
  listChannels,
  resolveUsers,
  SlackApiError,
} from "@/lib/server/slack";
import {
  isSecureRequest,
  resolveSession,
  sessionCookieHeader,
} from "@/lib/server/session";
import type { RunEvent, RunRequest } from "@/lib/slack/bridge-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Dumping a busy channel can take a while; don't let the platform cut it short. */
export const maxDuration = 3600;

function isRunRequest(value: unknown): value is RunRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.workspace !== "string") return false;
  switch (v.action) {
    case "auth-qr":
      return typeof v.qrImage === "string";
    case "auth-token":
      return typeof v.token === "string" && typeof v.cookie === "string";
    case "dump":
      return typeof v.channel === "string";
    case "resolve-users":
      return Array.isArray(v.userIds) && v.userIds.every((id) => typeof id === "string");
    case "channels":
      return true;
    default:
      return false;
  }
}

/**
 * Runs one bridge operation and streams its progress back as NDJSON.
 *
 * Each line is a `RunEvent`: `log` while it runs, then exactly one `done` or
 * `error`. A plain `fetch` + stream reader consumes this — unlike
 * `EventSource`, it can be a POST.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Corps de requête invalide.", { status: 400 });
  }
  if (!isRunRequest(body)) {
    return new Response("Requête invalide.", { status: 400 });
  }
  const job = body;
  const signal = request.signal;
  const session = resolveSession(request);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: RunEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };
      const onLog = (m: string) => send({ t: "log", m });

      try {
        let data: unknown;
        switch (job.action) {
          case "auth-qr":
            data = await authenticateWithQr(session.id, job.workspace, job.qrImage, onLog, signal);
            break;
          case "auth-token":
            data = await authenticateWithToken(
              session.id,
              job.workspace,
              job.token,
              job.cookie,
              onLog,
              signal,
            );
            break;
          case "channels":
            data = await listChannels(
              session.id,
              job.workspace,
              job.memberOnly !== false,
              onLog,
              signal,
            );
            break;
          case "resolve-users":
            data = await resolveUsers(session.id, job.workspace, job.userIds, onLog, signal);
            break;
          case "dump":
            data = await dumpChannel(session.id, job.workspace, job.channel, onLog, signal);
            break;
        }
        send({ t: "done", data });
      } catch (err) {
        if (signal.aborted) {
          closed = true;
        } else if (err instanceof BridgeError) {
          send({ t: "error", m: err.message, detail: err.detail });
        } else if (err instanceof SlackApiError) {
          send({ t: "error", m: err.message, detail: err.code });
        } else {
          send({ t: "error", m: err instanceof Error ? err.message : "Erreur inattendue." });
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  const headers = new Headers({
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store, no-transform",
    // keeps nginx and friends from buffering the progress stream
    "x-accel-buffering": "no",
  });
  if (session.isNew) {
    headers.append("set-cookie", sessionCookieHeader(session, isSecureRequest(request)));
  }
  return new Response(stream, { headers });
}
