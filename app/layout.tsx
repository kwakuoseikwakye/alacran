import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "AI-Native Control Panel",
  description: "Read-only status board for AI-Native agents",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
