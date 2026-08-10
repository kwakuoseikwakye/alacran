/**
 * Polls `/` until the relaunched server answers, then reloads to it. A fixed
 * delay would either jump the gun (dpkg + relaunch isn't instant) or make
 * every update feel slower than it needs to.
 *
 * Lives in a plain module, not inside update-banner.tsx, purely because two
 * separate client components (the banner and the Settings page) both need
 * it now — a client component importing a plain value from another client
 * component's file works fine (verified directly; only a *Server*
 * Component importing a plain value from a "use client" file breaks, which
 * is why THEME_STORAGE_KEY lives in lib/theme.ts instead of here).
 */
export async function waitForServerThenReload(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    try {
      const res = await fetch("/", { method: "HEAD", cache: "no-store" })
      if (res.ok) break
    } catch {
      // Still down: the old process is gone and the new one hasn't bound the port yet.
    }
  }
  window.location.reload()
}
