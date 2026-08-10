import path from "node:path"

/**
 * The path of the running .app bundle, or null when we aren't inside one.
 *
 * Deliberately derived from the running process rather than hardcoded to
 * /Applications: scripts/package-macos.sh's launcher cd's to
 * `<bundle>/Contents/Resources/app` before starting the server, so three
 * levels up from cwd is the bundle — wherever the user actually dragged it.
 * Someone running it from ~/Applications, an external disk, or a second copy
 * for testing must update THAT copy, not whatever happens to sit in
 * /Applications.
 *
 * Returns null (rather than guessing) in `next dev` and any unpackaged
 * checkout, which is what stops the updater from trying to "update" a
 * developer's working tree.
 */
export function resolveAppBundlePath(cwd: string = process.cwd()): string | null {
  // Verify the shape, don't just walk up blindly: cwd has to actually BE the
  // payload directory, or three-levels-up is some unrelated folder.
  const parts = cwd.split(path.sep)
  const tail = parts.slice(-3)
  if (tail[0] !== "Contents" || tail[1] !== "Resources" || tail[2] !== "app") return null

  const bundle = path.resolve(cwd, "..", "..", "..")
  return bundle.endsWith(".app") ? bundle : null
}
