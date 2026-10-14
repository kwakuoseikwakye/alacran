/**
 * Can THIS process install an update? Linux only — it is the one platform
 * where the update is a .deb this server can run pkexec against
 * (perform-linux-update-impl.ts). Windows has no packaged build at all.
 *
 * Not the same question as "can the user update from inside the app". On mac
 * that is yes, and always was possible, but the machinery is electron-updater
 * in the shell's main process rather than anything here — so it is answered at
 * RUNTIME by lib/updates/desktop-updater.ts, which the server cannot see. Both
 * consumers (the banner and the Settings page) show the button when either
 * says yes. Returning true here for darwin would be wrong in the other
 * direction: it would point mac at the Linux .deb path.
 *
 * Extracted to one function, used by both app/layout.tsx (the update
 * banner) and app/settings/page.tsx (the Settings page), so this reasoning
 * lives in one place instead of two copies of the same inline check.
 */
export function canAutoUpdate(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "linux"
}
