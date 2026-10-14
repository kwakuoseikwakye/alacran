/** Plain module, not the client component that reads it — v51's rule: a
 *  server component importing a value from a "use client" file silently gets
 *  a client reference instead of the string. */
export const ADVANCED_MODE_KEY = "alacran-advanced-mode"

/** Fired when the Settings toggle flips, so open pages update without a
 *  reload. `storage` only fires in OTHER tabs, which is the wrong half. */
export const ADVANCED_MODE_EVENT = "alacran-advanced-mode-change"

/**
 * Write simple mode ONCE, on a machine that has never chosen either way.
 *
 * Absent has to keep meaning "advanced" in `readAdvancedMode`: shipping the
 * default off is exactly what v71–v72 did, and v72 was a whole slice spent
 * undoing "features were removed" reports from people who had no idea a toggle
 * existed. Flipping that default back would re-run the same failure for every
 * existing user.
 *
 * So the distinction is not the default — it is *who is asking*. This is
 * called only from the onboarding screen, which renders only when zero
 * companies are registered, i.e. a genuinely new install. An existing user has
 * companies and never reaches it, so their absent key stays absent and stays
 * advanced. A new user gets the note-and-approve flow rather than an xterm
 * running a TUI, which is what simple mode was built for and was never the
 * default on the one install that needed it.
 *
 * Only ever writes when the key is ABSENT — an explicit choice in either
 * direction survives.
 */
export function seedSimpleModeForFreshInstall(): void {
  try {
    if (window.localStorage.getItem(ADVANCED_MODE_KEY) === null) {
      window.localStorage.setItem(ADVANCED_MODE_KEY, "0")
      // Writing storage is not enough: useAdvancedMode syncs on this event, and
      // child effects run before the parent's, so without it the first screen
      // renders advanced until something remounts it.
      window.dispatchEvent(new Event(ADVANCED_MODE_EVENT))
    }
  } catch {
    /* locked-down storage: the default (advanced) stands, same as everywhere else */
  }
}
