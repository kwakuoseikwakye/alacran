/**
 * The mac shell's own updater, when the page is running inside it.
 *
 * `canAutoUpdate()` next door answers the same question for the *server*
 * ("can this platform install its own update?") and is `linux` only, because
 * on mac the machinery is electron-updater in another process entirely
 * (the macOS shell). That left the mac Settings page with nothing to
 * offer but a link to the releases page and a manual re-download of the whole
 * app — which is the bug this fixes.
 *
 * Runtime-only: the bridge is `window.alacran`, published by that shell's
 * preload, so nothing on the server can see it and the components have to ask
 * in an effect. Absent everywhere else — browser, Linux shell, `next dev` —
 * and every caller falls back to the Linux/server path when it is.
 */

import type { DesktopMic } from "@/lib/voice/desktop-mic"
import type { DesktopFolderPicker } from "@/lib/desktop-folder-picker"
import type { DesktopLogin } from "@/lib/desktop-login"

export type DesktopUpdater = {
  install: () => Promise<{ ok: boolean; error?: string }>
  onProgress: (onPercent: (percent: number) => void) => () => void
}

// The one place `window.alacran` is typed — the bridge itself is one object
// with one member per thing the page cannot do on its own, so declaring the
// interface twice in two files would be a duplicate-property error rather
// than a merge. Each member's own module carries its reasoning.
declare global {
  interface Window {
    alacran?: {
      shell?: string
      update?: DesktopUpdater
      mic?: DesktopMic
      dialog?: DesktopFolderPicker
      login?: DesktopLogin
    }
  }
}

export function desktopUpdater(): DesktopUpdater | null {
  if (typeof window === "undefined") return null
  return window.alacran?.update ?? null
}
