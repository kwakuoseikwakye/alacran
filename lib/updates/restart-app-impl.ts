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
 */
export function restartAppImpl(spawnFn: SpawnFn = defaultSpawn, launcherPath: string = LINUX_LAUNCHER_PATH): void {
  const child = spawnFn(launcherPath, [], { detached: true, stdio: "ignore" })
  child.unref()
}
