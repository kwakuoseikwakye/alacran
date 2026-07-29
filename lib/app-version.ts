import pkg from "../package.json"

/**
 * The running app's version, taken from package.json at build time.
 *
 * package.json is the single source of truth: scripts/package-macos.sh reads
 * the same field into CFBundleVersion, so the number the update check compares
 * against is always the number the bundle claims. Hardcoding it in a second
 * place is how you end up shipping a build that can't tell it's out of date.
 */
export const APP_VERSION: string = pkg.version
