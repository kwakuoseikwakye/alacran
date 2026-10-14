import Link from "next/link"

/**
 * 21 files call `notFound()` — a removed company, a stale bookmark, a deep link
 * after a rename. Without this file every one of those is Next's bare "This
 * page could not be found." on a blank white page, with no way back in a window
 * that has no URL bar.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-xl font-bold text-os-text">That page isn&apos;t here</h1>
      <p className="max-w-md text-sm text-os-muted">
        The company you were looking for may have been removed from this computer, or renamed. Your files
        are untouched either way — removing a company never deletes its folder.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md border border-os-border bg-os-surface px-4 py-2 text-sm text-os-text transition hover:border-os-border-strong hover:bg-os-surface2"
      >
        Back to your companies
      </Link>
    </div>
  )
}
