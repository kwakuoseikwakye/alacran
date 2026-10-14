"use client"

import { useEffect } from "react"

/**
 * Last resort: a throw in the ROOT LAYOUT itself, which `app/error.tsx` cannot
 * catch because it renders inside that layout.
 *
 * This one must supply its own <html> and <body> — the layout that normally
 * provides them is the thing that failed. That also means none of the app's
 * fonts, theme script or design tokens have loaded, so the styling here is
 * inline and self-contained on purpose: a token-based class would render
 * unstyled text on a white page, which is what this file exists to prevent.
 *
 * The colours are the app's own default-theme token VALUES, read out of
 * globals.css (--bg, --text, --text-2, --text-3, --border, --surface) rather
 * than referenced as variables. Checked against that file, not recalled: the
 * first version of this used the landing site's venom-night palette, which is
 * a different set and would have rendered a window that did not look like the
 * app it crashed out of.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Alacrán failed to start this window:", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          background: "#0a0a0a",
          color: "#f2f2f2",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Alacrán couldn&apos;t open this window</h1>
        <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: "#9c9c9c", margin: 0 }}>
          Quitting and reopening the app usually fixes this. Your companies and their files are on your
          computer and are not affected.
        </p>
        {error.digest && (
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#5c5c5c", margin: 0 }}>
            Reference: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            borderRadius: "0.375rem",
            border: "1px solid #242424",
            background: "#0a0a0a",
            color: "#f2f2f2",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
