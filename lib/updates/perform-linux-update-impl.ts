import { isBinaryPresent } from "../binary-present"
import { defaultExecFile } from "../default-exec-file"
import { writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { DEB_ASSET_URL, RELEASES_API_URL, RELEASE_PAGE_URL } from "./fetch-latest-release-impl"
import { verifyReleaseSignature } from "./verify-signature"
import { dataPath } from "../data-dir"

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
export type FetchLike = (url: string) => Promise<{
  ok: boolean
  arrayBuffer: () => Promise<ArrayBuffer>
  json?: () => Promise<unknown>
  text?: () => Promise<string>
}>

export type PerformUpdateResult = { ok: true } | { ok: false; message: string; manualCommand?: string }

type ReleaseAsset = { name?: unknown; browser_download_url?: unknown }

/**
 * Downloads the latest .deb and installs it via `pkexec dpkg -i` — a native
 * graphical password prompt (the standard PolicyKit flow desktop package
 * managers like GNOME Software already use), not a silent sudo. Falls back
 * to a manual command instead of failing silently if pkexec isn't installed
 * or the user cancels the prompt.
 *
 * The download is checksum-verified before it is ever handed to dpkg. This
 * is not optional politeness: `pkexec dpkg -i` runs the package's maintainer
 * scripts AS ROOT, so anything that reaches that line has full control of
 * the machine. Previously this wrote whatever bytes came back straight to
 * disk and installed them, with TLS as the only thing standing in the way.
 *
 * Verified against a detached ed25519 signature made with a key GitHub never
 * holds — NOT against the sha256 GitHub publishes for the asset. That digest
 * proves nothing against the threat that matters: GitHub recomputes it from
 * whatever bytes are stored, so anyone able to rewrite a release rewrites its
 * digest to match. The signature is checked against a public key compiled into
 * this build (see verify-signature.ts), so the only thing that gets a vote is
 * a key that was fixed before the attacker arrived.
 *
 * Deliberately FAILS CLOSED, with no "install it anyway if there's no
 * signature" fallback — that fallback IS the attack, since omitting the .sig
 * costs nothing. An unsigned or unverifiable release means no install and a
 * link to the release page.
 *
 * macOS has its own path — see perform-mac-update-impl.ts. This comment used
 * to say macOS *couldn't* have one, because a downloaded copy is
 * Gatekeeper-quarantined until the user runs `xattr -cr`. That was measured
 * and turned out to be wrong for this case: quarantine is applied by the
 * downloading application (browsers do, `fetch` doesn't), so a payload the
 * app downloads itself is never quarantined.
 */
export async function performLinuxUpdateImpl(
  execFn: ExecFileFn = defaultExecFile,
  fetchFn: FetchLike = fetch,
  debPath: string = dataPath("update", "Alacran.deb"),
  // Injected only so the happy-path test can run on a machine without the
  // PRIVATE key — which is every machine except the release one, CI included.
  // The rejection tests deliberately leave this at the real implementation,
  // so "we forgot to actually check" still fails the suite.
  verifyFn: (sha256: Buffer, signature: string) => boolean = verifyReleaseSignature
): Promise<PerformUpdateResult> {
  const release = await fetchDebRelease(fetchFn)
  if (!release) {
    // No manualCommand on this path or the next. The UI renders that field as
    // a copyable SHELL COMMAND (see components/update-banner.tsx's
    // CommandLine), and there is no command that helps here — the correct
    // action is to not install these bytes at all. The URL goes in the
    // message, which is plain prose.
    return {
      ok: false,
      message: `This release isn't signed, so it wasn't installed. Download it from ${RELEASE_PAGE_URL} instead.`,
    }
  }

  const res = await fetchFn(release.url)
  if (!res.ok) {
    return { ok: false, message: "Couldn't download the update. Check your connection and try again." }
  }
  const bytes = Buffer.from(await res.arrayBuffer())

  const sigRes = await fetchFn(release.sigUrl)
  const signature = sigRes.ok && sigRes.text ? await sigRes.text() : ""
  if (!verifyFn(createHash("sha256").update(bytes).digest(), signature)) {
    // Nothing is written to disk on this path on purpose — a rejected download
    // should leave no file for a later run, or a curious user, to install by
    // hand.
    return {
      ok: false,
      message: `The downloaded update isn't signed by Alacrán, so it wasn't installed. Download it from ${RELEASE_PAGE_URL} instead.`,
    }
  }

  await mkdir(path.dirname(debPath), { recursive: true })
  await writeFile(debPath, bytes)

  if (!(await isBinaryPresent(execFn, "pkexec"))) {
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

/**
 * The version-pinned URLs for Alacran.deb and its detached signature.
 *
 * Both come from the SAME API response deliberately: `/releases/latest/
 * download/` re-resolves "latest" at request time, so a .deb and a .sig
 * fetched through it a moment apart can straddle a release that shipped in
 * between — a mismatch that looks exactly like an attack but is just a race.
 * `browser_download_url` is pinned to one release, so the signature always
 * describes the file actually fetched.
 */
async function fetchDebRelease(fetchFn: FetchLike): Promise<{ url: string; sigUrl: string } | null> {
  try {
    const res = await fetchFn(RELEASES_API_URL)
    if (!res.ok || !res.json) return null
    const data = (await res.json()) as { assets?: unknown }
    const assets = Array.isArray(data.assets) ? (data.assets as ReleaseAsset[]) : []
    const urlOf = (name: string) => {
      const a = assets.find((x) => x.name === name)
      return typeof a?.browser_download_url === "string" ? a.browser_download_url : null
    }
    const sigUrl = urlOf("Alacran.deb.sig")
    // An unsigned release is not installable either way, so bail here rather
    // than downloading 20MB first and rejecting it afterwards.
    if (!sigUrl) return null
    return { url: urlOf("Alacran.deb") ?? DEB_ASSET_URL, sigUrl }
  } catch {
    return null
  }
}
