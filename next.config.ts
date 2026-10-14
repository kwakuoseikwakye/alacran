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
  // node-pty resolves its binary through a RUNTIME-interpolated path —
  // `prebuilds/${os.platform()}-${os.arch()}/node.abi${modules}.node` — which
  // Next's file tracer cannot follow. Without this the standalone output omits
  // the whole package silently and the terminal 500s only in a packaged build.
  // Both packaging scripts also copy the package explicitly; this is the half
  // that stops Next bundling it in the first place.
  serverExternalPackages: ["@homebridge/node-pty-prebuilt-multiarch"],
}

export default nextConfig
