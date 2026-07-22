export type Frontmatter = {
  name?: string
  description?: string
}

export function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith("---")) return {}
  const closingIndex = content.indexOf("\n---", 3)
  if (closingIndex === -1) return {}
  const block = content.slice(3, closingIndex)

  const result: Frontmatter = {}
  for (const line of block.split("\n")) {
    const nameMatch = /^name:\s*(.+)$/.exec(line.trim())
    if (nameMatch) result.name = nameMatch[1].trim()
    const descMatch = /^description:\s*(.+)$/.exec(line.trim())
    if (descMatch) result.description = descMatch[1].trim()
  }
  return result
}
