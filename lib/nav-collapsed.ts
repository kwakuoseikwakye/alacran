/** Whether the labelled sub-nav is collapsed to zero width, leaving just the
 *  icon rail.
 *
 *  Lives in a plain module rather than beside the toggle, for the same reason
 *  THEME_STORAGE_KEY does (see lib/theme.ts): the root layout is a server
 *  component and needs the literal string for its blocking script, and
 *  importing a value from a "use client" module into a server component
 *  resolves to a client reference instead of the real string.
 */
export const SUBNAV_COLLAPSED_KEY = "alacran-subnav-collapsed"
