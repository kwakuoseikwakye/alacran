import type { Metadata } from "next"
import "./globals.css"
import { AutoRefresh } from "@/components/auto-refresh"
import { Nav } from "@/components/nav"

export const metadata: Metadata = {
  title: "AI-Native Control Panel",
  description: "Read-only status board for AI-Native agents",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AutoRefresh />
        <Nav />
        {children}
      </body>
    </html>
  )
}
