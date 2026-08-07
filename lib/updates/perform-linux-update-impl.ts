import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { DEB_ASSET_URL } from "./fetch-latest-release-impl"
import { dataPath } from "../data-dir"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
export type FetchLike = (url: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

async function isPresent(execFn: ExecFileFn, name: string): Promise<boolean> {
  try {
    await execFn("which", [name])
    return true
  } catch {
    return false
  }
}

export type PerformUpdateResult = { ok: true } | { ok: false; message: string; manualCommand?: string }

/**
 * Downloads the latest .deb and installs it via `pkexec dpkg -i` — a native
 * graphical password prompt (the standard PolicyKit flow desktop package
 * managers like GNOME Software already use), not a silent sudo. Falls back
 * to a manual command instead of failing silently if pkexec isn't installed
 * or the user cancels the prompt.
 *
 * macOS has no equivalent: those builds are ad-hoc signed, not notarized
 * (see scripts/package-macos.sh), so a freshly downloaded copy is
 * Gatekeeper-quarantined and won't open until the user runs `xattr -cr`
 * themselves. Auto-installing it here would silently produce a build that
 * looks updated but refuses to launch — worse than the existing "download
 * it" link, so macOS deliberately keeps that instead of getting this path.
 */
export async function performLinuxUpdateImpl(
  execFn: ExecFileFn = defaultExecFile,
  fetchFn: FetchLike = fetch,
  debPath: string = dataPath("update", "Alacran.deb")
): Promise<PerformUpdateResult> {
  const res = await fetchFn(DEB_ASSET_URL)
  if (!res.ok) {
    return { ok: false, message: "Couldn't download the update. Check your connection and try again." }
  }
  await mkdir(path.dirname(debPath), { recursive: true })
  await writeFile(debPath, Buffer.from(await res.arrayBuffer()))

  if (!(await isPresent(execFn, "pkexec"))) {
    return {
      ok: false,
      message: "Downloaded the update, but this system has no pkexec to install it automatically.",
      manualCommand: `sudo apt install ${debPath}`,
    }
  }

  try {
    await execFn("pkexec", ["dpkg", "-i", debPath])
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      manualCommand: `sudo apt install ${debPath}`,
    }
  }
}
