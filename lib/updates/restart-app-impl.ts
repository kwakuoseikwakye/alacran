import { spawn as defaultSpawn, type ChildProcess } from "node:child_process"
import { resolveAppBundlePath } from "./resolve-app-bundle"

export type SpawnFn = (command: string, args: string[], opts: Record<string, unknown>) => ChildProcess

// scripts/package-linux.sh always installs the launcher here — a fixed
// location, not something to discover, since only one thing ever puts a
// file at this path.
export const LINUX_LAUNCHER_PATH = "/usr/bin/alacran"

/**
 * Re-launches the installed launcher (which knows how to find node, pick a
 * port, and reopen the browser — see scripts/package-linux.sh) and detaches
 * it, so it survives this process exiting. The caller is responsible for
 * actually exiting after this returns; this function only starts the next
 * process, it never stops the current one.
 */
export function restartAppImpl(
  spawnFn: SpawnFn = defaultSpawn,
  launcherPath: string = LINUX_LAUNCHER_PATH,
  platform: NodeJS.Platform = process.platform,
  bundlePath: string | null = resolveAppBundlePath()
): void {
  // macOS has no fixed launcher path — the bundle is wherever the user
  // dragged it, so relaunch the one we're actually running from. `open`
  // hands it to LaunchServices, which is what a normal double-click does;
  // spawning Contents/MacOS/launcher directly would reparent it under a
  // process that's about to exit.
  if (platform === "darwin" && bundlePath) {
    const child = spawnFn("open", ["-a", bundlePath], { detached: true, stdio: "ignore" })
    child.on("error", () => {})
    child.unref()
    return
  }
  const child = spawnFn(launcherPath, [], { detached: true, stdio: "ignore" })
  // If the launcher is missing, this process is about to exit anyway (the
  // caller exits ~300ms later) — but an unhandled "error" event would crash
  // it first, losing the graceful shutdown for no reason.
  child.on("error", () => {})
  child.unref()
}
