import {
  authenticateWithToken,
  BridgeError,
  dumpChannel,
  listChannels,
  resolveUsers,
  SlackApiError,
} from "@/lib/server/slack";
import { CredentialJar } from "@/lib/server/credentials";
import { localeFromRequest, sm, withLocale } from "@/lib/i18n/server";
import type { RunEvent, RunRequest } from "@/lib/slack/bridge-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Dumping a busy channel can take a while. 300 s is the most every Vercel plan
 * allows; a self-hosted server does not enforce it.
 */
export const maxDuration = 300;

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value as object).every((v) => typeof v === "string")
  );
}

function isRunRequest(value: unknown): value is RunRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.workspace !== "string") return false;
  switch (v.action) {
    case "auth-token":
      return typeof v.token === "string" && typeof v.cookie === "string";
    case "dump":
      return typeof v.channel === "string" && (v.known === undefined || isStringRecord(v.known));
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
  const locale = localeFromRequest(request);
  // Everything the job logs or throws reads its wording from this locale.
  return withLocale(locale, () => handle(request));
}

async function handle(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(sm().invalidBody, { status: 400 });
  }
  if (!isRunRequest(body)) {
    return new Response(sm().invalidRequest, { status: 400 });
  }
  const job = body;
  const signal = request.signal;
  const jar = new CredentialJar(request);

  // Signing in sets a cookie, and headers must be sent before the body: run
  // it to the end first (a single auth.test), then answer in one go.
  if (job.action === "auth-token") {
    const events: RunEvent[] = [];
    try {
      const data = await authenticateWithToken(
        jar,
        job.workspace,
        job.token,
        job.cookie,
        (m) => events.push({ t: "log", m }),
        signal,
      );
      events.push({ t: "done", data });
    } catch (err) {
      events.push(toErrorEvent(err));
    }
    const headers = new Headers({
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    });
    for (const cookie of jar.setCookieHeaders()) headers.append("set-cookie", cookie);
    return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", { headers });
  }

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
          case "channels":
            data = await listChannels(
              jar,
              job.workspace,
              job.memberOnly !== false,
              onLog,
              signal,
            );
            break;
          case "resolve-users":
            data = await resolveUsers(jar, job.workspace, job.userIds, onLog, signal);
            break;
          case "dump":
            data = await dumpChannel(jar, job.workspace, job.channel, onLog, signal, job.known);
            break;
        }
        send({ t: "done", data });
      } catch (err) {
        if (signal.aborted) closed = true;
        else send(toErrorEvent(err));
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
  return new Response(stream, { headers });
}

function toErrorEvent(err: unknown): RunEvent {
  if (err instanceof BridgeError) return { t: "error", m: err.message, detail: err.detail };
  if (err instanceof SlackApiError) return { t: "error", m: err.message, detail: err.code };
  return { t: "error", m: err instanceof Error ? err.message : sm().unexpectedError };
}
