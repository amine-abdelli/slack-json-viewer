import { randomBytes } from "node:crypto";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    /**
     * The fallback key for the Slack credential cookies when
     * `SLACK_VIEWER_SECRET` is not set (`lib/server/credentials.ts`).
     *
     * Made once per build (or per `next dev`) and inlined where it is read —
     * server code only, never the page — so every route and every serverless
     * instance of one deployment share it. A key made at run time would differ
     * between Vercel functions, and between hot reloads in development: the
     * sign-in would not survive the next request. A new deployment still signs
     * everyone out; `SLACK_VIEWER_SECRET` avoids that.
     */
    LOQUARIUM_BUILD_KEY: randomBytes(32).toString("hex"),
  },
};

export default nextConfig;
