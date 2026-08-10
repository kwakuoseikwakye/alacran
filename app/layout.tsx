import type { Metadata } from "next"
import { Nunito, Nunito_Sans } from "next/font/google"
import "./globals.css"
import { AutoRefresh } from "@/components/auto-refresh"
import { Sidebar } from "@/components/sidebar"
import { getUpdateStatus } from "@/lib/updates/update-actions"
import { UpdateBanner } from "@/components/update-banner"
import { THEME_STORAGE_KEY } from "@/lib/theme"

// next/font downloads and self-hosts at build time, so the packaged .app still
// renders correctly with no network. Important for a local-first product.
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-nunito",
  display: "swap",
})

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-nunito-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Alacrán",
  description: "Run your own AI-native company, locally on your own computer.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const update = await getUpdateStatus()
  // suppressHydrationWarning below: the blocking script sets data-theme
  // directly on <html> before React hydrates, on purpose — without it,
  // React logs a (harmless but noisy) hydration-mismatch warning for the
  // one attribute it doesn't itself render. Standard fix for this exact
  // no-flash-theme pattern.
  return (
    <html lang="en" className={`${nunito.variable} ${nunitoSans.variable}`} suppressHydrationWarning>
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
        <Sidebar />

        {/* Main content pane offset from the sidebar */}
        <div className="app-shell-main">
          {update.available && update.latestVersion ? (
            <UpdateBanner
              latestVersion={update.latestVersion}
              currentVersion={update.currentVersion}
              canAutoUpdate={process.platform === "linux"}
            />
          ) : null}
          {children}
        </div>
      </body>
    </html>
  )
}
