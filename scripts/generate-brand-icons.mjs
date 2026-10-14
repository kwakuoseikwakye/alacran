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
  {
    // Kiro publishes a real SVG (kiro.dev/icon.svg), so this is EXTRACTED, not
    // traced — no potrace, no approximation, the vendor's own curves scaled
    // 1200 -> 24 with `svgpath` (installed --no-save for the regeneration,
    // same rule as simple-icons). Two things to know if this is ever redone:
    // the file's first <path> is the <mask>'s own rectangle and must be
    // dropped (including it renders a white box behind the ghost — caught by
    // rendering it, not by reading it), and the two eyes are separate
    // subpaths that only punch through with `fillRule: "evenodd"`.
    // `hex` is the official artwork's own background fill.
    id: "kiro",
    title: "Kiro",
    hex: "#9046ff",
    onDark: "#b98cff",
    fillRule: "evenodd",
    path: "M7.9711 16.3783C6.3263 20.0206 9.8295 20.9348 12.4134 18.8031 13.1737 21.1932 16.021 19.4095 17.0447 17.5559 19.2957 13.4713 18.3864 9.3071 18.1528 8.4475 16.5527 2.5889 8.5525 2.5789 7.176 8.4773 6.853 9.5109 6.848 10.6836 6.6692 11.901 6.5797 12.5172 6.5101 12.9098 6.2766 13.5557 6.1375 13.9285 5.9536 14.2564 5.6555 14.8129 5.1983 15.6776 5.3921 17.3423 7.7574 16.4777L7.981 16.3783H7.9711Z M12.7225 10.9871C12.0666 10.9871 11.9672 10.2019 11.9672 9.7348 11.9672 9.3125 12.0417 8.9795 12.1859 8.7659 12.3101 8.577 12.4939 8.4826 12.7225 8.4826 12.9511 8.4826 13.1498 8.577 13.2889 8.7708 13.448 8.9895 13.5325 9.3224 13.5325 9.7348 13.5325 10.52 13.2294 10.9871 12.7275 10.9871H12.7225Z M15.4248 10.9871C14.7689 10.9871 14.6695 10.2019 14.6695 9.7348 14.6695 9.3125 14.7441 8.9795 14.8882 8.7659 15.0124 8.577 15.1963 8.4826 15.4248 8.4826 15.6534 8.4826 15.8522 8.577 15.9913 8.7708 16.1503 8.9895 16.2348 9.3224 16.2348 9.7348 16.2348 10.52 15.9318 10.9871 15.4298 10.9871H15.4248Z",
  },
  {
    // Beeper ships no SVG anywhere on its site — only PNG favicons — so this
    // is the v44 potrace route against the official 512px asset, thresholded
    // to isolate the white B from its blue field. `hex` is the artwork's own
    // dominant colour, sampled (167328 px of #394ff5), not invented.
    // potrace emits `transform="translate(0,512) scale(0.1,-0.1)"`, and SVG
    // applies the RIGHTMOST transform first — scale, then translate. Getting
    // that backwards renders an empty box, which is exactly what the first
    // attempt did.
    id: "beeper",
    title: "Beeper",
    hex: "#394ff5",
    onDark: "#8fa1ff",
    fillRule: "evenodd",
    path: "M9.5156 5.2266C8.3203 5.4703 7.3453 6.3469 6.9516 7.5234 6.8391 7.8562 6.825 7.9687 6.825 8.5547 6.825 9.1406 6.8391 9.2531 6.9516 9.5859 7.0172 9.7922 7.1531 10.0969 7.2516 10.2609 7.4719 10.6406 7.9406 11.1469 8.2781 11.3672L8.5313 11.5359 8.5313 14.4187 8.5313 17.3016 11.2641 17.2875 13.9922 17.2734 14.3859 17.1375C15.4078 16.7813 16.1531 15.975 16.3875 14.9766 16.4859 14.5594 16.4578 13.8703 16.3266 13.4953 16.125 12.9094 15.6234 12.2953 15.0234 11.9016L14.7188 11.7 15.3 11.1141C15.8109 10.5891 15.9 10.4719 16.0969 10.0781 16.3547 9.5531 16.4531 9.1359 16.4531 8.5547 16.4531 7.9734 16.3547 7.5562 16.0969 7.0359 15.9141 6.6703 15.8063 6.5203 15.4734 6.1875 15.0281 5.7375 14.6484 5.4984 14.0719 5.3016L13.7109 5.1797 11.7656 5.1703C10.2891 5.1656 9.7453 5.1797 9.5156 5.2266ZM13.8938 6.1781C14.4234 6.375 14.8641 6.7359 15.1875 7.2234 15.4547 7.6359 15.5391 7.9547 15.5391 8.5547 15.5391 9.1406 15.4594 9.4547 15.2063 9.8578 15.1172 10.0031 14.175 10.9781 12.8859 12.2672 11.6906 13.4578 10.7063 14.4234 10.7016 14.4187 10.6922 14.4141 10.8375 13.6734 11.0156 12.7734 11.1984 11.8734 11.3438 11.1187 11.3438 11.1 11.3438 11.0812 11.0109 11.0625 10.6031 11.0625 10.0969 11.0625 9.7781 11.0391 9.5906 10.9922 8.475 10.7016 7.6875 9.6937 7.6875 8.5547 7.6875 7.4344 8.4328 6.4641 9.5391 6.1359 9.7922 6.0609 10.0172 6.0516 11.7188 6.0609 13.5516 6.0703 13.6266 6.075 13.8938 6.1781Z",
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
  // Kimi Code's executor mark. In the dataset as `siKimi`, official hex pure
  // black like GitHub/Notion/Anthropic, so it needs the lightened variant or
  // it is invisible on this app's near-black surfaces.
  ["kimi", "siKimi", "#000000", "#e6e8eb"],
  // The landing site names the chat networks Beeper bridges and the tools MCP
  // reaches, and a named product with no mark reads as a gap. onDark is the
  // official hex lightened until it clears ~7.8:1 on the app ground, which is
  // the band every pair above already sits in; WhatsApp's green is bright
  // enough to need no lift at all.
  ["figma", "siFigma", "#f24e1e", "#f6815f"],
  ["vercel", "siVercel", "#000000", "#e6e8eb"],
  ["whatsapp", "siWhatsapp", "#25d366", "#25d366"],
  ["telegram", "siTelegram", "#26a5e4", "#37ace6"],
  ["signal", "siSignal", "#3b45fd", "#9399fe"],
  /* The rest of the networks Beeper bridges. These were assumed absent from the
     dataset and never actually looked up, which left them as grey monograms
     beside real logos and is what "the icons are not visible" turned out to
     mean. Check the dataset before assuming a mark does not exist. */
  ["discord", "siDiscord", "#5865f2", "#929bf7"],
  ["instagram", "siInstagram", "#ff0069", "#ff73ac"],
  ["messenger", "siMessenger", "#0866ff", "#68a2ff"],
  ["imessage", "siImessage", "#34da50", "#34da50"],
  ["googlemessages", "siGooglemessages", "#1a73e8", "#6ca5f0"],
]

// SPEC's `hex` and the dataset's own hex do two different jobs, and they were
// one field until they disagreed. `hex` is the flat fill the APP renders, which
// is a design choice; `brandHex` is what the vendor actually uses, which is a
// fact and is what the sprite's colour variant must carry. They are the same
// value for every mark but one, so the generator asserts it: a vendor rebrand,
// or a dataset correction, should fail here rather than quietly ship a stale
// colour on the marketing site.
const HEX_OVERRIDES = {
  // Tux's real yellow is unreadable on the app's near-black chrome, so the app
  // renders the mark flat black. The sprite's c-linux keeps the real yellow,
  // because a symbol whose whole contract is "the vendor's own colour" must
  // not answer with a design decision. Nothing on the site uses c-linux today;
  // whoever does will need a dark tile behind it.
  linux: "Tux yellow is unreadable on near-black; the app renders it flat.",
}

/* The marketing site is dark, and a brand whose real hex is black renders as a
   hole in it: GitHub, Notion, Vercel and Kimi all measured about 1.1:1 against
   the page ground, which is invisible rather than subtle. Every mark already
   carries an `onDark` lightening for the app's own dark chrome; this is what
   finally routes it to the sprite.

   The choice is computed, not curated: keep the vendor's real colour whenever
   it is legible, and fall back to the lightened variant only when it is not.
   WCAG's floor for a graphic is 3:1, and 3.5 is used here because these render
   at 15-20px where the floor is not enough. */
const DARK_GROUND = "#08090b"

function relLum(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}
function contrast(a, b) {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const DARK_MIN = 3.5
function onDarkFill(id, brandHex, onDark) {
  if (contrast(brandHex, DARK_GROUND) >= DARK_MIN) return brandHex
  if (contrast(onDark, DARK_GROUND) < DARK_MIN) {
    throw new Error(
      `${id}: neither ${brandHex} (${contrast(brandHex, DARK_GROUND).toFixed(2)}:1) nor its ` +
        `onDark ${onDark} (${contrast(onDark, DARK_GROUND).toFixed(2)}:1) is legible on ${DARK_GROUND}. ` +
        `Lighten onDark until it clears ${DARK_MIN}:1.`
    )
  }
  return onDark
}

const brands = [
  ...SPEC.map(([id, key, hex, onDark]) => {
    const icon = si[key]
    if (!icon) throw new Error(`simple-icons has no export "${key}" — it may have been withdrawn.`)
    const brandHex = `#${icon.hex.toLowerCase()}`
    if (brandHex !== hex && !HEX_OVERRIDES[id]) {
      throw new Error(
        `${id}: SPEC says ${hex}, simple-icons says ${brandHex}. If the vendor ` +
          `rebranded, update SPEC. If the difference is deliberate, add ${id} to ` +
          `HEX_OVERRIDES with the reason.`
      )
    }
    return { id, title: icon.title, hex, brandHex, onDark, darkFill: onDarkFill(id, brandHex, onDark), path: icon.path }
  }),
  // A manual mark has no dataset entry to disagree with, so its one hex serves
  // both jobs.
  ...MANUAL_MARKS.map((m) => ({ ...m, brandHex: m.hex, darkFill: onDarkFill(m.id, m.hex, m.onDark) })),
]

// Beeper and Antigravity are potraced; Kiro is EXTRACTED from the vendor's own
// published SVG. Collapsing that into "traced" is wrong and this string is the
// only place most readers will see it.
const GENERATED =
  "Generated: do not hand-edit the path data. Most marks come from the Simple Icons dataset (CC0-1.0), path and hex verbatim. Three come from MANUAL_MARKS in scripts/generate-brand-icons.mjs, for products Simple Icons has never carried: Beeper and Antigravity potraced from the vendors' own hosted artwork, Kiro extracted from kiro.dev's own published SVG. Nothing here was drawn by hand or approximated."

const tsEntries = brands
  .map(
    (b) =>
      `  ${JSON.stringify(b.id)}: {\n` +
      `    title: ${JSON.stringify(b.title)},\n` +
      `    hex: ${JSON.stringify(b.hex)},\n` +
      `    onDark: ${JSON.stringify(b.onDark)},\n` +
      `    path: ${JSON.stringify(b.path)},\n` +
      // Only emitted for the marks that need it. Simple Icons authors its
      // paths for the SVG default (nonzero) with holes wound to suit, so
      // setting evenodd globally would change shapes that are already right.
      (b.fillRule ? `    fillRule: ${JSON.stringify(b.fillRule)},\n` : "") +
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
  /** Only set where a mark's holes need it — see the generator's MANUAL_MARKS. */
  fillRule?: "evenodd"
}

export const BRAND_ICONS = {
${tsEntries}
} as const satisfies Record<string, BrandIconData>

export type BrandId = keyof typeof BRAND_ICONS
`
)

// Two symbols per mark. `b-` inherits currentColor, which is what a mark in a
// line of text or on a tinted tile wants; `c-` bakes the vendor's own hex onto
// the path so a logo row reads as real products at a glance. The fill is a
// presentation attribute INSIDE the symbol, which beats a `fill` set on the
// <svg> at the use site, so `c-` stays coloured wherever it is placed.
//
// fill-rule has to be carried here too, or a mark whose holes depend on it
// renders solid on the landing page while looking right in the app — Kiro's
// eyes are exactly that shape.
const symbols = brands
  .map((b) => {
    const rule = b.fillRule ? ` fill-rule="${b.fillRule}"` : ""
    return (
      `<symbol id="b-${b.id}" viewBox="0 0 24 24"><title>${b.title}</title>` +
      `<path${rule} d="${b.path}"/></symbol>` +
      `<symbol id="c-${b.id}" viewBox="0 0 24 24"><title>${b.title}</title>` +
      `<path${rule} fill="${b.brandHex}" d="${b.path}"/></symbol>` +
      `<symbol id="d-${b.id}" viewBox="0 0 24 24"><title>${b.title}</title>` +
      `<path${rule} fill="${b.darkFill}" d="${b.path}"/></symbol>`
    )
  })
  .join("")

writeFileSync(
  "landing/brands.js",
  `/* ${GENERATED}
   Regenerate with scripts/generate-brand-icons.mjs.

   Injects one <svg> sprite of real product marks, in two variants:
     <svg class="bi"><use href="#b-gmail"/></svg>   monochrome, inherits currentColor
     <svg class="bi"><use href="#c-gmail"/></svg>   the vendor's own brand colour
     <svg class="bi"><use href="#d-gmail"/></svg>   the same, legible on a dark ground

   The d- variant keeps the real colour wherever it clears 3.5:1 on ${DARK_GROUND}
   and swaps to the mark's lightened onDark value only where it does not, which
   is why GitHub, Notion, Vercel and Kimi differ between c- and d- and nothing
   else does.

   Several of these marks are genuinely multi-coloured in reality; the dataset
   ships one path and one hex, so the colour variant is a flat brand fill and
   not a reproduction of the real geometry. That is the honest version and it
   is what a logo row wants.

   NOT here, and checked rather than assumed against every entry in the dataset:
   Slack and OpenAI (withdrawn at the vendors' request), plus Canva, Lovable,
   DocuSign, freee and LinkedIn (never carried). Searching for "Canva" hits
   Canvas and PlayCanvas, and "linked" hits nothing at all; both are different
   products or no product. Name these in prose; never redraw a trademarked
   mark. */
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
