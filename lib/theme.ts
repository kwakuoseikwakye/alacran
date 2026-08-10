/** Same flag name as landing/index.html's own toggle (localStorage doesn't
 *  cross origins, but the two brand halves agree on what it's called).
 *  Lives here, not in theme-toggle.tsx: the root layout (a server
 *  component) needs the plain string for its blocking script, and
 *  importing a value from a "use client" module into a server component
 *  resolves to a client reference, not the real string — confirmed live,
 *  it silently rendered as `localStorage.getItem(undefined)`. */
export const THEME_STORAGE_KEY = "alacran-theme"
