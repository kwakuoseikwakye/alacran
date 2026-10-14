"use client"

import { useEffect } from "react"
import Link from "next/link"

/**
 * What a user sees when a page throws.
 *
 * Without this file Next renders its own screen — "Application error: a
 * server-side exception has occurred" plus a digest hash — with no sidebar, no
 * chrome and no way back. In the packaged desktop shell there is no URL bar
 * either, so that screen is a dead end: the only exit is quitting the app.
 *
 * And the throw is not exotic here. This app reads YAML that a user may hand-
 * edit and an agent also writes, validated with Zod on the way in; a malformed
 * records file or ontology is the EXPECTED failure, not the rare one. A product
 * whose whole pitch is "your business memory in plain files you own" has to
 * survive one of those files being wrong.
 *
 * Deliberately plain: no data fetching, no company lookup, nothing that could
 * throw a second time. An error page that can fail is not one.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The digest is all a user can quote back; the message only exists in
    // development, so log both and let them copy whichever they have.
    console.error("Alacrán page error:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-xl font-bold text-os-text">Something went wrong on this page</h1>
      <p className="max-w-md text-sm text-os-muted">
        The rest of the app is fine. This often means one of your company&apos;s files can&apos;t be read —
        try again, and if it keeps happening, check the file this page was showing you.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-os-dim">
          Reference: {error.digest}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-os-border bg-os-surface px-4 py-2 text-sm text-os-text transition hover:border-os-border-strong hover:bg-os-surface2"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md px-4 py-2 text-sm text-os-muted underline-offset-4 transition hover:text-os-text hover:underline"
        >
          Back to your companies
        </Link>
      </div>
    </div>
  )
}
