import type { NextConfig } from "next"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appDir = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Produce a self-contained production server under .next/standalone for
  // packaging as a downloadable browser-runner app.
  output: "standalone",
  // Pin the trace root to this app dir so the standalone output is flat
  // (.next/standalone/server.js) instead of nested under an inferred
  // multi-lockfile workspace root.
  outputFileTracingRoot: appDir,
}

export default nextConfig
