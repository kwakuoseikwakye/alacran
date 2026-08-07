#!/usr/bin/env node
// Regenerates the real product-mark assets used by the app and the landing site.
//
//   npm install --no-save simple-icons && node scripts/generate-brand-icons.mjs
//
// Writes:
//   lib/brand-icons.ts  — path data for the React <BrandIcon> component
//   landing/brands.js   — an SVG <symbol> sprite for the static marketing pages
//
// simple-icons is a build-time-only dependency on purpose: the extracted path
// data is committed, so the shipped app has no runtime dependency and works
// entirely offline.
//
// Slack and OpenAI are intentionally NOT in the list — both vendors had their
// marks withdrawn from Simple Icons, and a redrawn approximation of a
// trademarked logo is worse than no logo at all. Mention them in prose instead.

import { writeFileSync } from "node:fs"
import * as si from "simple-icons"

// [id, simple-icons export, official hex, lightened variant for near-black surfaces]
const SPEC = [
  ["google", "siGoogle", "#4285f4", "#8ab4f8"],
  ["gmail", "siGmail", "#ea4335", "#ff7a6d"],
  ["googlecalendar", "siGooglecalendar", "#4285f4", "#8ab4f8"],
  ["googledrive", "siGoogledrive", "#4285f4", "#8ab4f8"],
  ["googlechat", "siGooglechat", "#34a853", "#5bd07c"],
  ["googlesheets", "siGooglesheets", "#34a853", "#5bd07c"],
  ["googledocs", "siGoogledocs", "#4285f4", "#8ab4f8"],
  ["claude", "siClaude", "#d97757", "#e89b80"],
  ["anthropic", "siAnthropic", "#191919", "#e6e0dc"],
  ["github", "siGithub", "#181717", "#e6e8eb"],
  ["notion", "siNotion", "#000000", "#e6e8eb"],
  ["linear", "siLinear", "#5e6ad2", "#9aa2ec"],
  ["git", "siGit", "#f03c2e", "#ff7a6d"],
  ["apple", "siApple", "#000000", "#e6e8eb"],
  // Paired with apple on the landing page's "runs on your computer" card —
  // that card shipped with an Apple mark alone, which read as macOS-only to
  // a Linux user standing right next to a .deb download button.
  ["linux", "siLinux", "#000000", "#e6e8eb"],
  ["lemonsqueezy", "siLemonsqueezy", "#ffc233", "#ffd977"],
]

const brands = SPEC.map(([id, key, hex, onDark]) => {
  const icon = si[key]
  if (!icon) throw new Error(`simple-icons has no export "${key}" — it may have been withdrawn.`)
  return { id, title: icon.title, hex, onDark, path: icon.path }
})

const GENERATED = "Generated from the Simple Icons dataset (CC0-1.0) — do not hand-edit the path data."

const tsEntries = brands
  .map(
    (b) =>
      `  ${b.id}: {\n` +
      `    title: ${JSON.stringify(b.title)},\n` +
      `    hex: ${JSON.stringify(b.hex)},\n` +
      `    onDark: ${JSON.stringify(b.onDark)},\n` +
      `    path: ${JSON.stringify(b.path)},\n` +
      `  },`
  )
  .join("\n")

writeFileSync(
  "lib/brand-icons.ts",
  `// ${GENERATED}
// Regenerate with scripts/generate-brand-icons.mjs.
//
// \`hex\` is each vendor's official brand colour; \`onDark\` is the lightened
// variant used on Alacrán's near-black surfaces, because several official marks
// (GitHub, Notion, Anthropic, Apple) are pure black and would be invisible.
//
// Slack and OpenAI are deliberately absent: both had their marks withdrawn from
// Simple Icons at the vendors' request, and an approximated logo is worse than
// no logo. Reference them in prose, never with a redrawn mark.

export type BrandIconData = {
  title: string
  hex: string
  onDark: string
  path: string
}

export const BRAND_ICONS = {
${tsEntries}
} as const satisfies Record<string, BrandIconData>

export type BrandId = keyof typeof BRAND_ICONS
`
)

const symbols = brands
  .map(
    (b) =>
      `<symbol id="b-${b.id}" viewBox="0 0 24 24"><title>${b.title}</title><path d="${b.path}"/></symbol>`
  )
  .join("")

writeFileSync(
  "landing/brands.js",
  `/* ${GENERATED}
   Regenerate with scripts/generate-brand-icons.mjs.
   Injects one <svg> sprite of real product marks; reference them as
   <svg class="bi"><use href="#b-gmail"/></svg>. Marks inherit currentColor,
   and each .brandtile sets --brand to the vendor's colour for hover/active. */
(function () {
  var SPRITE = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${symbols}</svg>';
  function inject() {
    if (document.getElementById('brand-sprite')) return;
    var host = document.createElement('div');
    host.id = 'brand-sprite';
    host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    host.innerHTML = SPRITE;
    document.body.insertBefore(host, document.body.firstChild);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
`
)

console.log(`wrote lib/brand-icons.ts + landing/brands.js (${brands.length} marks)`)
