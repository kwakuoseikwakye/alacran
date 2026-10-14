import pkg from "../package.json"

/**
 * The running app's version, taken from package.json at build time.
 *
 * package.json is the single source of truth: scripts/package-linux.sh (and,
 * on mac, the macOS shell's own package.json, bumped to match) read the
 * same field, so the number the update check compares against is always the
 * number the shipped build claims. Hardcoding it in a second place is how
 * you end up shipping a build that can't tell it's out of date.
 */
export const APP_VERSION: string = pkg.version
