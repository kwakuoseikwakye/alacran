import { verify as verifyOneShot, createPublicKey } from "node:crypto"

/**
 * The public half of the release signing key (base64 SPKI DER, ed25519).
 *
 * The private half lives on the release machine and in the CI secret
 * ALACRAN_SIGNING_KEY — never in this repo, never anywhere GitHub can read
 * it back out. See scripts/sign-release.mjs for the signing side.
 *
 * This constant is the whole point of the scheme: it ships INSIDE the app, so
 * an already-installed Alacrán judges an update against a key that was fixed
 * before the attacker showed up. Nothing fetched at update time gets a vote —
 * not the digest GitHub publishes (GitHub recomputes that from whatever bytes
 * are stored, so rewriting a release rewrites the digest too), and not
 * latest-mac.yml (just another file in the same release).
 *
 * Rotating it is a breaking change on purpose: an installed copy only ever
 * accepts updates signed by the key it shipped with, so a new key can only
 * reach users through a release signed with the OLD one. Losing the private
 * key means every existing install falls back to a manual download.
 */
export const RELEASE_PUBLIC_KEY = "MCowBQYDK2VwAyEAq8zx+zcJosMDwHe+Cb/UkK/gzfC5MYjCIP9W7CvBgFg="

/**
 * True only if `signature` is this project's signature over `sha256`.
 *
 * Throws for nothing — a malformed signature, a truncated one, garbage from a
 * 404 page served where a .sig was expected — because every one of those means
 * the same thing to the caller, and a throw on the install path would read as
 * "something went wrong, maybe retry" rather than "do not install this".
 */
export function verifyReleaseSignature(sha256: Buffer, signature: string): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(RELEASE_PUBLIC_KEY, "base64"),
      format: "der",
      type: "spki",
    })
    // ed25519 is one-shot in Node's API: no createVerify/update dance, and
    // `null` is the required (unused) digest argument.
    return verifyOneShot(null, sha256, key, Buffer.from(signature.trim(), "base64"))
  } catch {
    return false
  }
}
