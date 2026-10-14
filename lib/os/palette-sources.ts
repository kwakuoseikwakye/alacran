import { NAV_GROUPS, hrefFor } from "./nav"

export type PaletteCommand = {
  id: string
  label: string
  hint: string
  href: string
  keywords: string
}

export function buildCommands(input: {
  companyId: string | null
  companies: { id: string; name: string }[]
  agents: { id: string; name: string }[]
}): PaletteCommand[] {
  const nav: PaletteCommand[] = NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      id: `nav-${item.slug}`,
      label: item.label,
      hint: "go to",
      href: hrefFor(item, input.companyId),
      keywords: `${group.label} ${item.slug}`,
    }))
  )

  const companies: PaletteCommand[] = input.companies.map((c) => ({
    id: `company-${c.id}`,
    label: c.name,
    hint: "company",
    href: `/c/${c.id}/dashboard`,
    keywords: `switch open ${c.id}`,
  }))

  const agents: PaletteCommand[] = input.companyId
    ? input.agents.map((a) => ({
        id: `agent-${a.id}`,
        label: a.name,
        hint: "agent",
        href: `/c/${input.companyId}/agents`,
        keywords: `run agent ${a.id}`,
      }))
    : []

  return [...nav, ...companies, ...agents]
}

/**
 * Drops the pages simple mode hides from the sidebar. The palette is built on
 * the server, which can't see the mode (it lives in the browser), so the
 * filter runs where the palette renders — without it, ⌘K offered every hidden
 * page to a user in simple mode.
 */
export function forMode(commands: PaletteCommand[], advanced: boolean): PaletteCommand[] {
  if (advanced) return commands
  const hidden = new Set(
    NAV_GROUPS.flatMap((g) => g.items.filter((i) => i.advancedOnly).map((i) => `nav-${i.slug}`))
  )
  return commands.filter((c) => !hidden.has(c.id))
}

/**
 * Substring match, ordered: label prefix, then label substring, then keywords.
 * Deliberately not fuzzy — a palette that matches "brn" to Brain also matches
 * it to six other things, and this list is short enough that exactness wins.
 */
export function rankCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands

  const scored = commands
    .map((c) => {
      const label = c.label.toLowerCase()
      if (label.startsWith(q)) return { c, score: 0 }
      if (label.includes(q)) return { c, score: 1 }
      if (c.keywords.toLowerCase().includes(q)) return { c, score: 2 }
      return null
    })
    .filter((s): s is { c: PaletteCommand; score: number } => s !== null)

  return scored.sort((a, b) => a.score - b.score).map((s) => s.c)
}
