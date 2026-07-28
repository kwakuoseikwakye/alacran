import type { Metadata } from "next"
import { Nunito, Nunito_Sans } from "next/font/google"
import "./globals.css"
import { AutoRefresh } from "@/components/auto-refresh"
import { Nav } from "@/components/nav"
import { getLicenseStatus } from "@/lib/license/license-actions"
import { LicenseGate } from "@/components/license-gate"

// next/font downloads and self-hosts at build time, so the packaged .app still
// renders correctly with no network — important for a local-first product.
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
  description: "Run your own AI-native company, locally on your Mac.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const license = await getLicenseStatus()
  return (
    <html lang="en" className={`${nunito.variable} ${nunitoSans.variable}`}>
      <body>
        {license.licensed ? (
          <>
            <AutoRefresh />
            <Nav />
            {children}
          </>
        ) : (
          <LicenseGate reason={license.message} />
        )}
      </body>
    </html>
  )
}
