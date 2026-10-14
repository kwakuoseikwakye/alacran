import { spawn as defaultSpawn, type ChildProcess } from "node:child_process"

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
 *
 * Linux only, now. The mac shell used to have its own branch here (macOS has
 * no fixed launcher path, so it re-opened the .app bundle it was running
 * from via `open -n -a`), but mac is Electron going forward, and an Electron
 * app restarts itself through electron-updater's own `quitAndInstall()`
 * — this codebase's restart path has nothing to do there anymore. See
 * lib/updates/can-auto-update.ts, which is what keeps this from being
 * called on mac at all.
 */
export function restartAppImpl(spawnFn: SpawnFn = defaultSpawn, launcherPath: string = LINUX_LAUNCHER_PATH): void {
  const child = spawnFn(launcherPath, [], { detached: true, stdio: "ignore" })
  // If the launcher is missing, this process is about to exit anyway (the
  // caller exits ~300ms later) — but an unhandled "error" event would crash
  // it first, losing the graceful shutdown for no reason.
  child.on("error", () => {})
  child.unref()
}
