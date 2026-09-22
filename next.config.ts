import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server with only the modules it
  // actually uses, which is what the container image ships.
  output: "standalone",
};

export default nextConfig;
