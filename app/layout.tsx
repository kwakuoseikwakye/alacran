import type { Metadata } from "next"
import { JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { cookies } from "next/headers"
import { AutoRefresh } from "@/components/auto-refresh"
import { Shell } from "@/components/os/shell"
import { Topbar } from "@/components/os/topbar"
import { getUpdateStatus } from "@/lib/updates/update-actions"
import { canAutoUpdate } from "@/lib/updates/can-auto-update"
import { UpdateBanner } from "@/components/update-banner"
import { ChangelogModal } from "@/components/changelog-modal"
import { THEME_INIT_SCRIPT } from "@/lib/theme"
import { SIDEBAR_WIDTH_KEY, SIDEBAR_COLLAPSED_KEY } from "@/components/os/sidebar"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"
import { guidePendingCount } from "@/lib/guide/observe"
import { openFlagCount } from "@/lib/jobs/view"
import { ACTIVE_COMPANY_COOKIE, resolveActiveCompany } from "@/lib/os/active-company"
import { buildCommands } from "@/lib/os/palette-sources"
import { buildShellAssistant } from "@/lib/os/shell-assistant"
import { readVoiceSettingsViewImpl } from "@/lib/voice/settings-impl"

// next/font downloads and self-hosts at build time, so the packaged .app still
// renders correctly with no network. Important for a local-first product —
// never swap this for a fonts.googleapis.com link, which would make every
// launch phone home.
//
// Sora (display) + Inter (body) replaced Nunito/Nunito Sans: Nunito's rounded
// terminals read soft and consumer-friendly, which fought the venom-night
// brand, and rounded shapes lose crispness at the 11-13px this dashboard uses
// almost everywhere. Sora is geometric and precise and still carries an 800
// weight, so every heading that asked for 800 keeps a real drawn weight
// instead of a synthesized one. Deliberately NOT a return to Geist, which
// v29 replaced on purpose.
//
// The token names are font-agnostic now. They named the font through two
// changes of it, which is exactly how a comment becomes a lie.
// Deliberately still 600/700/800, with no 400 — do not "fix" this by adding
// one. The assistant design's caption declares `400 20px/1.45 Sora`, but the
// design file itself imports Sora at 600/700/800 only, so its own reference
// render resolves that 400 to 600 (CSS font matching: 400 tries 500, then
// below, then above). Loading a real 400 would make our caption render
// LIGHTER than the design it is meant to match. Matching the render beats
// matching the declaration.
// The assistant design uses mono as a real typographic tier (status pills,
// caption sub-line, transcript role tags, footer), and the app had no real
// mono face — `--typeface-mono` was a system stack, so the same line rendered
// as SF Mono on macOS and DejaVu Sans Mono on Linux.
//
// Wired to BOTH `--asst-mono` and `--typeface-mono` in globals.css now — the
// design-system pass that repointed the latter, bringing the app in line with
// the landing site's one-brand rule. That repoint restyles 14 existing
// surfaces plus the in-app terminal, which reads `--typeface-mono` directly
// at terminal-workspace.tsx:75 — an app-wide re-skin, done deliberately as its
// own slice rather than smuggled in with a page. Self-hosted at build time
// like the other two — never a fonts.googleapis.com link, which would make
// every launch phone home.
const monoFace = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-face",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Alacrán",
  description: "Run your own AI-native company, locally on your own computer.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const update = await getUpdateStatus()
  // Cheap (a readdir plus a few file reads per company, no subprocess), and it
  // has to be here rather than on one page: a result left by a scheduled run
  // is the one thing the user didn't ask for and so isn't already looking at.
  const [agents, voice] = await Promise.all([getEffectiveAgents(), readVoiceSettingsViewImpl()])
  const guidePending = (await Promise.all(agents.map((a) => guidePendingCount(a.id)))).reduce<number>((sum, n) => sum + n, 0)
  const jobFlags = (await Promise.all(agents.map((a) => openFlagCount(a.id)))).reduce<number>((sum, n) => sum + n, 0)
  const pendingReviews = (await listPendingReviews(agents)).length + guidePending + jobFlags
  // The active company for the rail on non-company routes (`/`, `/system/*`).
  // A `/c/[companyId]` route mounts its own <Shell> keyed off the URL instead —
  // see app/c/[companyId]/layout.tsx — and this instance steps aside there.
  const active = resolveActiveCompany(
    (await cookies()).get(ACTIVE_COMPANY_COOKIE)?.value,
    agents.map((a) => a.id)
  )
  const commands = buildCommands({
    companyId: active,
    companies: agents.map((a) => ({ id: a.id, name: a.name })),
    agents: [],
  })
  // Same read the old full-page /assistant route did (see git history) —
  // moved here now that the stage docks into the shell instead.
  const assistant = buildShellAssistant(agents, voice, voice.persona)
  // suppressHydrationWarning below: the blocking script sets data-theme
  // directly on <html> before React hydrates, on purpose — without it,
  // React logs a (harmless but noisy) hydration-mismatch warning for the
  // one attribute it doesn't itself render. Standard fix for this exact
  // no-flash-theme pattern.
  return (
    <html
      lang="en"
      className={monoFace.variable}
      suppressHydrationWarning
    >
      <head>
        {/* Blocking, pre-hydration: sets data-theme before first paint so a
            saved "light" choice never flashes dark first. Server always
            renders no attribute (= dark, see globals.css); this only ever
            has anything to correct for a returning light-mode user.

            data-subnav rides along for the same reason and by the same
            mechanism: the labelled sub-nav's width is a CSS variable keyed off
            this attribute, and without a pre-paint stamp a collapsed sub-nav
            renders full width and snaps to zero on hydration, dragging the
            whole page with it. One script, one try/catch — a browser that
            throws on localStorage must not take the document down with it.

            data-shell is the third, and comes from the desktop shell rather
            than storage: the macOS shell's preload sets window.alacran
            before any page script runs, and on mac the traffic lights float
            OVER this page (titleBarStyle "hiddenInset"), so the top strip has
            to be reserved and made draggable. Pre-paint for the same reason as
            the other two — reserving 34px after hydration would visibly drop
            the whole page. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `${THEME_INIT_SCRIPT}try{var d=document.documentElement;var sw=Number(localStorage.getItem(${JSON.stringify(SIDEBAR_WIDTH_KEY)}));if(Number.isFinite(sw)&&sw>=190&&sw<=420)d.style.setProperty('--sidebar-w',sw+'px');if(localStorage.getItem(${JSON.stringify(SIDEBAR_COLLAPSED_KEY)})==='1'){d.setAttribute('data-sidebar','collapsed');d.style.setProperty('--sidebar-w','56px');}}catch(e){}try{if(window.alacran&&window.alacran.shell)document.documentElement.setAttribute('data-shell',window.alacran.shell);if(window.alacran&&window.alacran.appearance)document.documentElement.setAttribute('data-vibrancy','')}catch(e){}`,
          }}
        />
      </head>
      <body className="relative overflow-x-hidden">
        {/* The window's drag handle, and nothing else. A real element rather
            than a ::before on <body>: Chromium builds its draggable-region
            map from layout objects and does not reliably pick up
            -webkit-app-region on a pseudo-element. Inert and invisible off
            mac (see globals.css) — it only has a size under
            :root[data-shell="mac"]. */}
        <div id="titlebar-drag" aria-hidden />

        <AutoRefresh />

        {/* #a-gooey — blur, then threshold the alpha back to hard edges, which
            is what makes two separate shapes read as one liquid body. Used
            only by primary buttons' press layer (see globals.css). Zero-size
            and aria-hidden: a filter definition is not content. */}
        <svg width="0" height="0" aria-hidden focusable="false" style={{ position: "absolute" }}>
          <filter id="a-gooey" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
            />
          </filter>
        </svg>

        {/* Icon rail + labelled sub-nav (desktop) + bottom nav (mobile).
            rootFallback: this instance serves `/` and `/system/*`; a
            `/c/[companyId]` route mounts its own <Shell> and this one hides. */}
        <Shell
          companyId={active}
          pendingReviews={pendingReviews}
          commands={commands}
          assistant={assistant}
          companies={agents.map((a) => ({ id: a.id, name: a.name }))}
          rootFallback
        />

        {/* Main content pane, offset from the sidebar */}
        <div className="app-shell-main">
          {update.available && update.latestVersion ? (
            <UpdateBanner
              latestVersion={update.latestVersion}
              currentVersion={update.currentVersion}
              canAutoUpdate={canAutoUpdate()}
            />
          ) : null}
          <ChangelogModal />
          {/* The toolbar lies OVER the scroller, not inside it, so the page
              still slides under it and turns it to glass — and on a Mac it
              stays the window's drag handle, which Electron ignores on
              anything inside a scrolling element. */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <Topbar
              companies={agents.map((a) => ({ id: a.id, name: a.name }))}
              activeCompanyId={active}
            />
            <div id="app-scroll" className="min-w-0 flex-1 overflow-y-auto">
              {children}
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
