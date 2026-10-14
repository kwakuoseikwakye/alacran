/**
 * Appearance: three choices — System (the default, which follows the OS),
 * Light and Dark — and two applied themes, stamped as `data-theme` on <html>
 * before first paint by THEME_INIT_SCRIPT. The tokens live in app/globals.css:
 * the base :root is dark and :root[data-theme="light"] overrides it.
 *
 * Six named skins shipped before 2026-09-28 (Monolith, Daylight, Terminal,
 * Clay, Midnight, Ember). A value one of them left in storage maps to the
 * nearer of the two themes, so nobody who picked one is dropped back to
 * System.
 */
export const THEME_CHOICES = ["system", "light", "dark"] as const
export type ThemeChoice = (typeof THEME_CHOICES)[number]
export type AppliedTheme = Exclude<ThemeChoice, "system">

export const DEFAULT_THEME_CHOICE: ThemeChoice = "system"
export const THEME_STORAGE_KEY = "alacran-theme"
export const THEME_LABELS: Record<ThemeChoice, string> = { system: "System", light: "Light", dark: "Dark" }

/** Every value storage may hold, from this release or an older one. */
const STORED: Record<string, ThemeChoice> = {
  system: "system",
  light: "light",
  dark: "dark",
  mono: "dark",
  midnight: "dark",
  ember: "dark",
  "mono-light": "light",
}

export function resolveThemeChoice(stored: string | null): ThemeChoice {
  return stored !== null && Object.prototype.hasOwnProperty.call(STORED, stored) ? STORED[stored] : DEFAULT_THEME_CHOICE
}

export function appliedTheme(choice: ThemeChoice, prefersLight: boolean): AppliedTheme {
  return choice === "system" ? (prefersLight ? "light" : "dark") : choice
}

/**
 * Blocking, pre-paint, injected in <head> by app/layout.tsx, so a saved theme
 * never flashes the other one first. Written as ES5 because it runs before
 * anything else, in every shell. It keeps listening to the OS for as long as
 * the document lives (client navigation never reloads it), re-reading the
 * stored choice each time, so System follows a light/dark switch and an
 * explicit choice ignores one. It also tells the Mac shell which appearance
 * to draw its glass in — that material follows macOS, not this page.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement,stored=${JSON.stringify(STORED)},key=${JSON.stringify(THEME_STORAGE_KEY)},fallback=${JSON.stringify(DEFAULT_THEME_CHOICE)};var m=window.matchMedia?window.matchMedia("(prefers-color-scheme: light)"):null;function choice(){var s=null;try{s=localStorage.getItem(key)}catch(e){}return s!==null&&Object.prototype.hasOwnProperty.call(stored,s)?stored[s]:fallback}function apply(){var c=choice();d.setAttribute("data-theme",c==="system"?(m&&m.matches?"light":"dark"):c);return c}var c=apply();try{if(window.alacran&&window.alacran.appearance)window.alacran.appearance.set(c)}catch(e){}if(m&&m.addEventListener)m.addEventListener("change",apply);else if(m&&m.addListener)m.addListener(apply)})();`
