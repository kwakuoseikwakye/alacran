import type { Metadata } from "next"
import { Sora, Inter } from "next/font/google"
import "./globals.css"
import { AutoRefresh } from "@/components/auto-refresh"
import { Sidebar } from "@/components/sidebar"
import { getUpdateStatus } from "@/lib/updates/update-actions"
import { UpdateBanner } from "@/components/update-banner"
import { THEME_STORAGE_KEY } from "@/lib/theme"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"

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
const displayFace = Sora({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display-face",
  display: "swap",
})

const bodyFace = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-face",
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
  const pendingReviews = (await listPendingReviews(await getEffectiveAgents())).length
  // suppressHydrationWarning below: the blocking script sets data-theme
  // directly on <html> before React hydrates, on purpose — without it,
  // React logs a (harmless but noisy) hydration-mismatch warning for the
  // one attribute it doesn't itself render. Standard fix for this exact
  // no-flash-theme pattern.
  return (
    <html lang="en" className={`${displayFace.variable} ${bodyFace.variable}`} suppressHydrationWarning>
      <head>
        {/* Blocking, pre-hydration: sets data-theme before first paint so a
            saved "light" choice never flashes dark first. Server always
            renders no attribute (= dark, see globals.css); this only ever
            has anything to correct for a returning light-mode user. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}`,
          }}
        />
      </head>
      <body className="relative overflow-x-hidden">
        <AutoRefresh />

        {/* Surreal animated background orbs – z-index 0 so everything sits above */}
        <div aria-hidden="true">
          <span className="surreal-orb one" />
          <span className="surreal-orb two" />
          <span className="surreal-orb three" />
        </div>

        {/* Glassmorphic sidebar (desktop) + bottom nav (mobile) */}
        <Sidebar pendingReviews={pendingReviews} />

        {/* Main content pane offset from the sidebar */}
        <div className="app-shell-main">
          {update.available && update.latestVersion ? (
            <UpdateBanner
              latestVersion={update.latestVersion}
              currentVersion={update.currentVersion}
              canAutoUpdate={process.platform === "linux" || process.platform === "darwin"}
            />
          ) : null}
          {children}
        </div>
      </body>
    </html>
  )
}
