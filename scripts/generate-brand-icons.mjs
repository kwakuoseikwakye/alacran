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

// Marks not (yet) in the Simple Icons dataset. Still a REAL mark, not a
// hand-drawn approximation: each path is traced (potrace, from the vendor's
// own hosted transparent PNG/ICO — antigravity.google's own
// /assets/image/antigravity-logo.png and /favicon.ico, fetched 2026-08-09),
// normalized into the same 24x24 grid as the Simple Icons entries above. The
// official mark is a blue→green→orange gradient; this component only ever
// renders a flat fill, so `hex` is the dominant colour sampled from the mark
// itself (the legs, its largest area) rather than an invented value — it
// lands on the same Google Blue already used for every other Google mark
// here, which also keeps the family visually consistent.
const MANUAL_MARKS = [
  {
    id: "google-antigravity",
    title: "Google Antigravity",
    hex: "#4285f4",
    onDark: "#8ab4f8",
    path: "M11.32 1c-0.03 0.02 -0.12 0.05 -0.19 0.06 -0.19 0.03 -0.53 0.13 -0.66 0.2 -0.06 0.03 -0.13 0.06 -0.14 0.06 -0.07 0 -0.6 0.34 -0.89 0.57 -0.17 0.14 -0.39 0.34 -0.49 0.45 -0.1 0.11 -0.23 0.26 -0.28 0.32 -0.13 0.14 -0.46 0.62 -0.62 0.89 -0.03 0.06 -0.09 0.16 -0.13 0.22 -0.11 0.19 -0.54 1.06 -0.63 1.27 -0.04 0.11 -0.1 0.25 -0.14 0.31 -0.03 0.06 -0.06 0.13 -0.06 0.15 0 0.02 -0.03 0.09 -0.06 0.15 -0.03 0.06 -0.06 0.13 -0.06 0.16 0 0.02 -0.03 0.1 -0.06 0.16 -0.03 0.06 -0.06 0.13 -0.06 0.15 0 0.02 -0.02 0.08 -0.04 0.14 -0.05 0.1 -0.15 0.38 -0.21 0.59 -0.02 0.07 -0.06 0.18 -0.08 0.24 -0.1 0.28 -0.15 0.42 -0.21 0.63 -0.04 0.12 -0.08 0.26 -0.1 0.32 -0.01 0.05 -0.04 0.14 -0.06 0.2 -0.01 0.06 -0.05 0.19 -0.08 0.3 -0.06 0.2 -0.13 0.43 -0.23 0.79 -0.03 0.11 -0.09 0.32 -0.13 0.45 -0.07 0.28 -0.15 0.54 -0.24 0.84 -0.04 0.11 -0.06 0.22 -0.06 0.24 0 0.01 -0.03 0.12 -0.06 0.24 -0.07 0.23 -0.15 0.51 -0.24 0.83 -0.03 0.11 -0.08 0.29 -0.11 0.4 -0.22 0.76 -0.4 1.36 -0.49 1.62 -0.03 0.09 -0.06 0.18 -0.06 0.21 0 0.03 -0.03 0.1 -0.06 0.17 -0.03 0.07 -0.06 0.14 -0.06 0.17 0 0.03 -0.02 0.1 -0.05 0.16 -0.03 0.06 -0.07 0.17 -0.09 0.25 -0.05 0.16 -0.1 0.31 -0.16 0.45 -0.02 0.06 -0.05 0.14 -0.07 0.2 -0.01 0.05 -0.06 0.18 -0.1 0.3 -0.04 0.11 -0.1 0.26 -0.12 0.33 -0.02 0.07 -0.06 0.16 -0.08 0.21 -0.02 0.05 -0.07 0.16 -0.1 0.24 -0.2 0.5 -0.71 1.6 -0.87 1.88 -0.3 0.52 -0.55 0.92 -0.66 1.08 -0.17 0.25 -0.44 0.61 -0.49 0.66 -0.02 0.02 -0.12 0.14 -0.22 0.25 -0.1 0.11 -0.34 0.38 -0.54 0.58 -0.37 0.39 -0.6 0.71 -0.65 0.89 -0.01 0.06 -0.05 0.11 -0.07 0.12 -0.03 0.01 -0.04 0.07 -0.04 0.27l0 0.25 0.15 0.15c0.08 0.08 0.16 0.15 0.19 0.15 0.03 0 0.08 0.03 0.12 0.06 0.07 0.05 0.12 0.06 0.47 0.06 0.31 0 0.4 -0.01 0.44 -0.04 0.03 -0.02 0.08 -0.05 0.13 -0.06 0.04 -0.01 0.12 -0.03 0.17 -0.05 0.27 -0.1 0.28 -0.1 0.63 -0.33 0.87 -0.58 1.84 -1.48 2.52 -2.32 0.49 -0.62 1.01 -1.35 1.2 -1.68 0.03 -0.04 0.07 -0.12 0.1 -0.17 0.03 -0.05 0.09 -0.14 0.12 -0.2 0.03 -0.06 0.08 -0.14 0.11 -0.19 0.03 -0.04 0.16 -0.28 0.31 -0.52 0.14 -0.24 0.28 -0.49 0.32 -0.55 0.03 -0.06 0.08 -0.14 0.1 -0.19 0.02 -0.04 0.07 -0.13 0.11 -0.2 0.04 -0.07 0.09 -0.15 0.11 -0.2 0.02 -0.04 0.1 -0.17 0.17 -0.28 0.07 -0.12 0.16 -0.26 0.2 -0.32 0.03 -0.06 0.08 -0.14 0.11 -0.18 0.22 -0.34 0.29 -0.44 0.44 -0.65 0.34 -0.46 0.68 -0.83 1.11 -1.17 0.29 -0.24 0.39 -0.3 0.73 -0.47 0.32 -0.16 0.38 -0.18 0.61 -0.25 0.49 -0.14 0.69 -0.17 1.33 -0.17 0.53 0 0.66 0.01 0.96 0.07 0.19 0.04 0.38 0.09 0.43 0.11 0.04 0.02 0.1 0.04 0.13 0.04 0.07 0 0.62 0.27 0.83 0.41 0.41 0.28 0.45 0.31 0.83 0.7 0.37 0.38 0.74 0.86 1.14 1.51 0.06 0.09 0.14 0.23 0.2 0.31 0.05 0.08 0.12 0.19 0.15 0.24 0.03 0.05 0.08 0.14 0.12 0.21 0.04 0.07 0.09 0.16 0.12 0.21 0.03 0.05 0.08 0.14 0.12 0.21 0.04 0.07 0.09 0.15 0.11 0.18 0.01 0.03 0.06 0.11 0.1 0.17 0.04 0.06 0.15 0.26 0.26 0.44 0.11 0.19 0.22 0.37 0.25 0.41 0.03 0.04 0.08 0.13 0.11 0.19 0.03 0.06 0.08 0.13 0.1 0.16 0.02 0.03 0.09 0.15 0.16 0.26 0.07 0.11 0.17 0.26 0.22 0.33 0.05 0.07 0.13 0.2 0.18 0.27 0.25 0.38 0.65 0.89 1.02 1.3 0.67 0.77 1.48 1.47 2.24 1.99 0.26 0.17 0.55 0.31 0.75 0.34 0.09 0.02 0.2 0.05 0.23 0.07 0.08 0.05 0.47 0.06 0.5 0.01 0.01 -0.01 0.09 -0.05 0.17 -0.07 0.2 -0.06 0.35 -0.16 0.4 -0.26 0.02 -0.04 0.06 -0.1 0.09 -0.12 0.04 -0.03 0.05 -0.1 0.05 -0.26 0 -0.18 -0.01 -0.23 -0.06 -0.28 -0.03 -0.03 -0.06 -0.08 -0.06 -0.11 0 -0.14 -0.31 -0.54 -0.78 -1.03 -0.42 -0.43 -0.91 -1.05 -1.12 -1.4 -0.01 -0.03 -0.08 -0.13 -0.14 -0.22 -0.06 -0.09 -0.19 -0.32 -0.29 -0.49 -0.1 -0.18 -0.2 -0.36 -0.23 -0.4 -0.08 -0.15 -0.46 -0.94 -0.6 -1.24 -0.04 -0.1 -0.17 -0.4 -0.26 -0.63 -0.03 -0.08 -0.09 -0.21 -0.12 -0.28 -0.03 -0.07 -0.06 -0.15 -0.06 -0.18 0 -0.03 -0.02 -0.08 -0.04 -0.11 -0.02 -0.03 -0.06 -0.13 -0.09 -0.21 -0.02 -0.08 -0.08 -0.25 -0.13 -0.36 -0.04 -0.12 -0.1 -0.27 -0.12 -0.34 -0.02 -0.07 -0.06 -0.18 -0.08 -0.24 -0.1 -0.27 -0.15 -0.42 -0.21 -0.63 -0.04 -0.12 -0.09 -0.3 -0.12 -0.39 -0.07 -0.21 -0.16 -0.53 -0.24 -0.81 -0.04 -0.12 -0.09 -0.31 -0.12 -0.42 -0.13 -0.44 -0.17 -0.6 -0.23 -0.82 -0.08 -0.29 -0.16 -0.59 -0.24 -0.85 -0.03 -0.11 -0.08 -0.3 -0.12 -0.43 -0.04 -0.13 -0.09 -0.34 -0.13 -0.45 -0.03 -0.12 -0.08 -0.3 -0.11 -0.4 -0.03 -0.11 -0.08 -0.3 -0.12 -0.42 -0.04 -0.12 -0.09 -0.32 -0.13 -0.43 -0.03 -0.12 -0.07 -0.25 -0.09 -0.3 -0.02 -0.05 -0.04 -0.14 -0.06 -0.21 -0.02 -0.07 -0.05 -0.19 -0.08 -0.27 -0.03 -0.08 -0.06 -0.18 -0.07 -0.22 -0.01 -0.04 -0.04 -0.14 -0.07 -0.22 -0.03 -0.08 -0.07 -0.22 -0.1 -0.3 -0.03 -0.08 -0.07 -0.22 -0.1 -0.3 -0.03 -0.08 -0.06 -0.19 -0.08 -0.24 -0.04 -0.15 -0.15 -0.44 -0.2 -0.55 -0.02 -0.05 -0.04 -0.11 -0.04 -0.13 0 -0.02 -0.03 -0.09 -0.06 -0.16 -0.03 -0.07 -0.09 -0.2 -0.12 -0.29 -0.04 -0.09 -0.09 -0.22 -0.12 -0.29 -0.03 -0.07 -0.06 -0.13 -0.06 -0.14 0 -0.02 -0.18 -0.4 -0.33 -0.71 -0.72 -1.46 -1.61 -2.48 -2.58 -2.96 -0.4 -0.2 -0.74 -0.32 -0.89 -0.32 -0.04 0 -0.14 -0.03 -0.2 -0.06 -0.11 -0.05 -0.18 -0.06 -0.77 -0.06 -0.52 0 -0.66 0.01 -0.71 0.04z",
  },
]

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

const brands = [
  ...SPEC.map(([id, key, hex, onDark]) => {
    const icon = si[key]
    if (!icon) throw new Error(`simple-icons has no export "${key}" — it may have been withdrawn.`)
    return { id, title: icon.title, hex, onDark, path: icon.path }
  }),
  ...MANUAL_MARKS,
]

const GENERATED =
  "Generated from the Simple Icons dataset (CC0-1.0), plus MANUAL_MARKS traced from real vendor assets for products Simple Icons doesn't carry yet — do not hand-edit the path data."

const tsEntries = brands
  .map(
    (b) =>
      `  ${JSON.stringify(b.id)}: {\n` +
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
