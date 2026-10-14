#!/usr/bin/env node
// Sign release artifacts with the project's own ed25519 key.
//
// Why this exists: Alacrán is not notarized, and won't be until there's a
// paid Apple Developer account. Without one, nothing in the DOWNLOAD path
// proves a build came from us — and the sha256 GitHub publishes for an asset
// doesn't either, because GitHub recomputes it from whatever bytes are
// stored. Anyone able to rewrite a release rewrites the digest with it.
//
// A signature made with a key GitHub never holds is what closes that. The
// public half is compiled into the app (see PUBLIC_KEY in
// lib/updates/verify-signature.ts and the macOS shell's electron/
// main.js), so the trust anchor is the copy the user ALREADY has, not the
// network and not GitHub. An attacker who takes over the releases repo can
// still serve a modified build; they cannot make an installed Alacrán accept
// it as an update.
//
// This does NOT protect a first install — a fake .dmg handed to someone who
// has never run Alacrán has nothing to check against. Only notarization
// covers that, and this is deliberately not sold as if it did.
//
// Signs the sha256 of the file rather than the file itself: artifacts run to
// ~180MB and ed25519 would otherwise want the whole thing in memory, on both
// the signing and the verifying side. The digest is streamed.
//
// Usage:  node scripts/sign-release.mjs dist/Alacran.deb [more files...]
// Key:    $ALACRAN_SIGNING_KEY (PEM contents, for CI) or
//         ~/.alacran-release-key/ed25519.pem
//
// Writes <file>.sig next to each input — base64, one line. Upload those
// alongside the artifacts; the updaters look for them by asset name.
import { createPrivateKey, sign as signOneShot } from "node:crypto"
import { createReadStream, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { pipeline } from "node:stream/promises"
import { homedir } from "node:os"
import path from "node:path"

const DEFAULT_KEY_PATH = path.join(homedir(), ".alacran-release-key", "ed25519.pem")

function loadKey() {
  const inline = process.env.ALACRAN_SIGNING_KEY
  if (inline && inline.trim()) return createPrivateKey(inline)
  try {
    return createPrivateKey(readFileSync(DEFAULT_KEY_PATH))
  } catch {
    console.error(
      `No signing key. Set ALACRAN_SIGNING_KEY to the PEM contents, or put it at ${DEFAULT_KEY_PATH}.`
    )
    process.exit(1)
  }
}

export async function sha256File(file) {
  const hash = createHash("sha256")
  await pipeline(createReadStream(file), hash)
  return hash.digest()
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error("Usage: node scripts/sign-release.mjs <file> [more files...]")
  process.exit(1)
}

const key = loadKey()
for (const file of files) {
  const digest = await sha256File(file)
  // ed25519 is a one-shot algorithm in Node's API — createSign/update/sign is
  // for RSA and ECDSA and throws here. `null` is the required digest argument.
  const sig = signOneShot(null, digest, key).toString("base64")
  writeFileSync(`${file}.sig`, sig + "\n")
  console.log(`signed ${file} -> ${path.basename(file)}.sig`)
}
