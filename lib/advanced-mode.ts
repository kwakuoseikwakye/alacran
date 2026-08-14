/** Plain module, not the client component that reads it — v51's rule: a
 *  server component importing a value from a "use client" file silently gets
 *  a client reference instead of the string. */
export const ADVANCED_MODE_KEY = "alacran-advanced-mode"

/** Fired when the Settings toggle flips, so open pages update without a
 *  reload. `storage` only fires in OTHER tabs, which is the wrong half. */
export const ADVANCED_MODE_EVENT = "alacran-advanced-mode-change"
