export type ChangelogCategory = "feature" | "improvement" | "fix"

export type ChangelogItem = {
  /**
   * The internal slice id the entry was written under (`v161`). A React key
   * and nothing else — users have never seen a "v161" and it is never
   * rendered. See `version` for the number they actually installed.
   */
  id: string
  /** The release this shipped in, e.g. `0.56.0`. Absent if the block omits it. */
  version?: string
  date?: string
  /** One plain sentence. The whole headline. */
  title: string
  highlights: string[]
  category: ChangelogCategory
}

/** `## v161 (2026-09-06): sidebar order, and the X that closed nothing` */
const SECTION_RE = /^##\s+(v\d+)(?:\s+\(([^)]+)\))?:/

/**
 * `### What's new for you (fix, v0.56.0)` — the authored, user-facing block.
 * The category is declared, never guessed, and the release version is the one
 * the user installed. Both apostrophes are accepted because editors
 * substitute one for the other without asking.
 */
const BLOCK_RE =
  /^###\s+What['’]s new for you\s*\(\s*(feature|improvement|fix)\s*(?:,\s*v?([0-9][0-9A-Za-z.+-]*))?\s*\)\s*$/i

const BULLET_RE = /^[-*]\s+(.+)$/

/**
 * Reads CHANGELOG.md and returns only what was explicitly written for users.
 *
 * CHANGELOG.md says of itself that it is kept "in the detail it was written in
 * rather than compressed into release notes", so scraping its prose puts file
 * paths, CSS and test counts in front of a non-technical founder. Nothing here
 * is inferred: an entry appears in the What's New modal if, and only if, it
 * carries a `### What's new for you (<category>, v<release>)` block, and only
 * that block's text is returned. An internal-only slice simply omits it and is
 * invisible — the default is "not shown" rather than "leaked".
 *
 * A block is a one-sentence headline followed by bullets, and ends at the
 * first line that is neither — which is how it can sit at the top of a section
 * with the engineering write-up below it, and not swallow any of it.
 *
 * Entries are returned newest-first by slice number.
 */
export function parseChangelog(
  content: string,
  options?: { maxEntries?: number }
): ChangelogItem[] {
  if (!content || typeof content !== "string") return []

  const items: ChangelogItem[] = []

  for (const section of content.split(/\n(?=##\s+v\d+)/)) {
    const lines = section.trim().split("\n")

    const head = (lines[0] ?? "").match(SECTION_RE)
    if (!head) continue

    const start = lines.findIndex((line) => BLOCK_RE.test(line.trim()))
    if (start === -1) continue // internal-only slice: nothing was written for users
    const declared = lines[start].trim().match(BLOCK_RE)!

    // Accumulate whole bullets and the whole headline, so a line wrapped at 80
    // columns in the source does not become a sentence cut off mid-clause.
    let title: string | undefined
    const highlights: string[] = []
    let buffer: { bullet: boolean; text: string } | null = null
    const flush = () => {
      if (!buffer) return
      if (buffer.bullet) highlights.push(buffer.text)
      else title ??= buffer.text
      buffer = null
    }

    for (const line of lines.slice(start + 1)) {
      const trimmed = line.trim()
      if (trimmed.startsWith("#")) break // the next heading ends the block
      if (!trimmed) {
        flush()
        continue
      }
      const bullet = trimmed.match(BULLET_RE)
      if (bullet) {
        flush()
        buffer = { bullet: true, text: bullet[1] }
      } else if (buffer) {
        buffer.text += ` ${trimmed}` // a wrapped continuation line
      } else if (title === undefined) {
        buffer = { bullet: false, text: trimmed }
      } else {
        break // prose after the headline and its bullets: the block is over
      }
    }
    flush()

    if (!title) continue // an empty block has nothing to show

    items.push({
      id: head[1],
      version: declared[2],
      date: head[2]?.trim(),
      title,
      highlights,
      category: declared[1].toLowerCase() as ChangelogCategory,
    })
  }

  items.sort(
    (a, b) => parseInt(b.id.slice(1), 10) - parseInt(a.id.slice(1), 10)
  )

  return options?.maxEntries === undefined
    ? items
    : items.slice(0, options.maxEntries)
}
