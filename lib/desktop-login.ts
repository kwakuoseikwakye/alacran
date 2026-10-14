/**
 * Whether the mac shell opens Alacrán when the user logs in.
 *
 * Scheduled jobs only run while the app is open, and the app told users so
 * without offering any way to make that likely. Runtime-only: absent in a
 * plain browser, `next dev`, the Linux shell, and any mac shell built before
 * this bridge existed — so callers gate on this returning non-null, the same
 * shape as lib/desktop-folder-picker.ts. `window.alacran` is typed in
 * lib/updates/desktop-updater.ts.
 */
export type DesktopLogin = {
  get: () => Promise<boolean>
  set: (open: boolean) => Promise<boolean>
}

export function desktopLogin(): DesktopLogin | null {
  if (typeof window === "undefined") return null
  return window.alacran?.login ?? null
}
