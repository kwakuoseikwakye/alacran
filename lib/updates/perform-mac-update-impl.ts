import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { writeFile, mkdir, rm, rename, stat, access } from "node:fs/promises"
import { constants } from "node:fs"
import path from "node:path"
import { MAC_ASSET_URL } from "./fetch-latest-release-impl"
import { resolveAppBundlePath } from "./resolve-app-bundle"
import { dataPath } from "../data-dir"
import type { PerformUpdateResult } from "./perform-linux-update-impl"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
export type FetchLike = (url: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

/**
 * Replace the running .app with the latest release, in place, then let the
 * caller relaunch it.
 *
 * Two things were measured on macOS 26.2 before this existed, because the
 * previous conclusion was that neither would work (see
 * perform-linux-update-impl.ts's comment, now corrected):
 *
 * 1. `com.apple.quarantine` is applied by the *downloading application* —
 *    browsers opt in via LSFileQuarantineEnabled, `fetch` and curl do not. A
 *    payload downloaded here carries no quarantine flag at all, so Gatekeeper
 *    never gets a chance to block it and the `xattr -cr` the manual install
 *    instructions require is unnecessary. It is still run below, as insurance
 *    for any future path where the archive arrives some other way.
 *
 * 2. TCC "App Management" (macOS 13+) gates one app modifying another's
 *    bundle, and its self-update exemption is defined by signing identity —
 *    which an ad-hoc build (`TeamIdentifier=not set`) hasn't got. Measured
 *    with a probe of this app's exact shape (ad-hoc .app in /Applications,
 *    started by LaunchServices, bash launcher running node from inside the
 *    bundle): the self-replace succeeded with no prompt and no EPERM.
 *
 * Replacing a bundle while running out of it is safe: the live process holds
 * the old inodes open, so it keeps working until it exits.
 */
export async function performMacUpdateImpl(
  execFn: ExecFileFn = defaultExecFile,
  fetchFn: FetchLike = fetch,
  bundlePath: string | null = resolveAppBundlePath(),
  zipPath: string = dataPath("update", "Alacran.zip")
): Promise<PerformUpdateResult> {
  if (!bundlePath) {
    return {
      ok: false,
      message:
        "This isn't a packaged copy of Alacrán, so there's nothing to replace. In-app updates only work in the installed .app.",
    }
  }

  // Staging must share a volume with the install: the swap below is two
  // rename() calls, and rename() cannot cross volumes. Putting this next to
  // the bundle rather than in /tmp keeps that true even when the app lives on
  // an external disk. The pid keeps two concurrent attempts off each other.
  const installParent = path.dirname(bundlePath)
  const stagingDir = path.join(installParent, `.alacran-update-${process.pid}`)
  const oldBundlePath = `${bundlePath}.old-${process.pid}`

  try {
    const res = await fetchFn(MAC_ASSET_URL)
    if (!res.ok) {
      return { ok: false, message: "Couldn't download the update. Check your connection and try again." }
    }
    await mkdir(path.dirname(zipPath), { recursive: true })
    await writeFile(zipPath, Buffer.from(await res.arrayBuffer()))

    await rm(stagingDir, { recursive: true, force: true })
    await mkdir(stagingDir, { recursive: true })
    // `ditto -x -k` is the counterpart to how the archive is built; it keeps
    // the code signature and the launcher's executable bit, which a plain
    // `unzip` does not reliably do.
    await execFn("ditto", ["-x", "-k", zipPath, stagingDir])

    const stagedBundle = path.join(stagingDir, path.basename(bundlePath))
    const payloadError = await checkPayload(stagedBundle)
    if (payloadError) {
      return { ok: false, message: payloadError }
    }

    // Insurance only — see the note above on why a fetch-downloaded payload
    // has no quarantine flag. Never allowed to fail the update.
    await execFn("xattr", ["-cr", stagedBundle]).catch(() => {})

    // The swap. Ordered so that any single failure leaves the user with a
    // working install rather than no install.
    await rename(bundlePath, oldBundlePath)
    try {
      await rename(stagedBundle, bundlePath)
    } catch (err) {
      await rename(oldBundlePath, bundlePath).catch(() => {})
      throw err
    }

    // Past this point the update HAS succeeded. A failure to delete the old
    // copy is litter, not a failed update, and must not be reported as one.
    await rm(oldBundlePath, { recursive: true, force: true }).catch(() => {})
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      manualCommand: `open "${MAC_ASSET_URL}"`,
    }
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {})
    await rm(zipPath, { force: true }).catch(() => {})
  }
}

/**
 * Refuse a malformed payload BEFORE the live bundle is moved. A truncated
 * download that still extracted, or an archive with an unexpected shape,
 * must not be what the user is left holding.
 */
async function checkPayload(stagedBundle: string): Promise<string | null> {
  try {
    if (!(await stat(stagedBundle)).isDirectory()) {
      return "The downloaded update isn't a valid app bundle. Nothing was changed."
    }
  } catch {
    return "The downloaded update didn't contain the app. Nothing was changed."
  }
  try {
    await access(path.join(stagedBundle, "Contents", "MacOS", "launcher"), constants.X_OK)
  } catch {
    return "The downloaded update is missing its launcher. Nothing was changed."
  }
  return null
}
