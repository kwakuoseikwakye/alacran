/**
 * What changed, in words, above the diff.
 *
 * A red/green diff is a fine answer to "what changed" for someone who reads
 * YAML. For the person this app is built for it is noise with colours, and the
 * approve button under it manufactures consent rather than obtaining it — she
 * either approves blind or never approves. This gives her something she can
 * actually agree or disagree with.
 *
 * Deliberately NOT a YAML parse. The text on either side is whatever an agent
 * wrote and may not be valid YAML at all (that is one of the things she is
 * being asked to catch), so a parser would throw exactly when the summary
 * matters most. Line shapes are enough to say "adds one entry" or "changes
 * bottleneck", and are wrong in a visible way rather than a silent one.
 *
 * Nesting matters and top-level-only was not good enough: every key in a real
 * company.yaml sits under meta:/customer:/org:/product:, so a `refresh` that
 * changed one fact produced "Rewrites some text, same number of lines." — the
 * single case this exists for. Keys are tracked with their parent path, so that
 * edit now reads "Changes customer › segments › name".
 *
 * ponytail: indentation-based, two levels of parent. A schema nested deeper
 * than that reads by its nearest two ancestors, which is still a name she can
 * check rather than a colour.
 */

const MAX_LINES = 6
const MAX_VALUE = 60

/** YAML values may carry their own quotes; the summary adds its own around
 *  them, and "" reads as an empty string rather than as emphasis. */
function clip(value: string): string {
  const unquoted = /^(['"])(.*)\1$/.exec(value)?.[2] ?? value
  return unquoted.length > MAX_VALUE ? `${unquoted.slice(0, MAX_VALUE - 1)}…` : unquoted
}

/**
 * Every `key: value` in the file, named by the path that leads to it.
 *
 * Indentation gives the parents; a list item ("- id: x") keeps its own keys
 * under the list's name rather than inventing one per entry. Values are keyed
 * by path, so two different `name:` fields under different parents do not
 * collide into one "changed name".
 */
function pairsByPath(text: string): Map<string, string> {
  const pairs = new Map<string, string>()
  const stack: Array<{ indent: number; key: string }> = []

  for (const raw of text.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue
    const body = raw.replace(/^(\s*)-\s+/, "$1  ")
    const match = /^(\s*)([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(body)
    if (!match) continue
    const [, indentText, key, value] = match
    const indent = indentText.length

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()
    const parents = stack.slice(-2).map((p) => p.key)
    const label = [...parents, key].join(" › ")

    if (value.trim()) {
      // Repeated paths (one per list entry) keep the FIRST value rather than
      // overwriting, so "changed" means changed rather than reordered.
      if (!pairs.has(label)) pairs.set(label, value.trim())
    } else {
      stack.push({ indent, key })
    }
  }
  return pairs
}

/**
 * List entries, counted only where a list is what the file holds.
 *
 * A markdown bullet is prose, so counting "- point one" as a record turned a
 * three-bullet digest into "Adds 3 entries" — a ledger reading of a note.
 */
function listItemCount(text: string, outputPath: string): number {
  if (!/\.ya?ml$/i.test(outputPath)) return 0
  return text.split("\n").filter((l) => /^\s*-\s/.test(l)).length
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function summariseChange(oldText: string, newText: string, outputPath: string): string[] {
  if (oldText === newText) return ["No changes."]

  const name = outputPath.split("/").pop() || outputPath
  if (!oldText.trim()) return [`Creates ${name}.`]
  if (!newText.trim()) return [`Empties ${name}.`]

  const lines: string[] = []

  // Entries first: for a records file this is the whole story, and it is the
  // one thing she can check against what she just said.
  const added = listItemCount(newText, outputPath) - listItemCount(oldText, outputPath)
  if (added > 0) lines.push(`Adds ${plural(added, "entry", "entries")}.`)
  else if (added < 0) lines.push(`Removes ${plural(-added, "entry", "entries")}.`)

  const before = pairsByPath(oldText)
  const after = pairsByPath(newText)
  const changed: string[] = []
  for (const [key, value] of after) {
    const was = before.get(key)
    if (was === undefined) changed.push(`Sets ${key} to "${clip(value)}".`)
    else if (was !== value) changed.push(`Changes ${key}: was "${clip(was)}", now "${clip(value)}".`)
  }
  for (const key of before.keys()) if (!after.has(key)) changed.push(`Removes ${key}.`)

  const room = MAX_LINES - lines.length - 1
  lines.push(...changed.slice(0, room))
  if (changed.length > room) lines.push(`…and ${changed.length - room} more field${changed.length - room === 1 ? "" : "s"}.`)

  if (lines.length === 0) {
    const oldLines = oldText.split("\n").length
    const newLines = newText.split("\n").length
    const delta = newLines - oldLines
    lines.push(
      delta === 0
        ? "Rewrites some text, same number of lines."
        : delta > 0
          ? `Adds ${plural(delta, "line")}.`
          : `Removes ${plural(-delta, "line")}.`
    )
  }
  return lines
}
