import type { Metadata } from "next"
import "./globals.css"
import { AutoRefresh } from "@/components/auto-refresh"
import { Nav } from "@/components/nav"
import { getLicenseStatus } from "@/lib/license/license-actions"
import { LicenseGate } from "@/components/license-gate"

export const metadata: Metadata = {
  title: "Alacrán",
  description: "Run your own AI-native company, locally on your Mac.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const license = await getLicenseStatus()
  return (
    <html lang="en">
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
