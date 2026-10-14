// Brand values in one place — the app, landing page, and packaging all read the
// same name. scripts/package-linux.sh has its own APP_NAME knob (mac packaging
// moved to the separately maintained macOS desktop shell) — keep them in sync.

/**
 * Folder under the user's home directory that new companies are suggested in.
 *
 * Deliberately ASCII "Alacran", NOT APP_NAME's accented "Alacrán": this is a
 * real filesystem path people type, tab-complete, cd into, and paste into
 * shell commands, and a non-ASCII character there is a papercut with no
 * upside. Only affects the SUGGESTED path for a new company — existing
 * companies are stored as absolute paths in the registry, so nothing already
 * registered moves or breaks.
 */
export const COMPANIES_DIR_NAME = "Alacran"
