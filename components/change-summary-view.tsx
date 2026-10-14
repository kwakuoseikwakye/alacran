import { summariseChange } from "@/lib/company-commands/change-summary"

/**
 * The plain-language version of the diff, rendered above it.
 *
 * Kept beside the diff rather than replacing it: someone who reads YAML loses
 * nothing, and someone who does not gets something they can actually agree
 * with instead of a wall of red and green.
 */
export function ChangeSummaryView({
  oldText,
  newText,
  outputPath,
}: {
  oldText: string
  newText: string
  outputPath: string
}) {
  const lines = summariseChange(oldText, newText, outputPath)
  return (
    <ul className="mb-3 space-y-1 rounded border border-os-border bg-os-surface2 px-3 py-2 text-xs text-os-text">
      {lines.map((line) => (
        <li key={line} className="flex gap-2">
          <span aria-hidden className="text-os-dim">
            •
          </span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  )
}
