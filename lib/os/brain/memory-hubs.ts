// Kept apart from memory-graph.ts so the client map can use the folder hubs
// without bundling the yaml parser that company facts need.

// A file belongs to the hub of its longest matching prefix, so sessions land
// in hub:sessions rather than hub:notes.
export const HUB_FOLDERS: Record<string, string> = {
  "definitions/": "hub:facts",
  "docs/decisions/": "hub:decisions",
  "notes/": "hub:notes",
  "notes/company/sessions/": "hub:sessions",
}

export function hubOf(path: string): string | null {
  let best = ""
  for (const prefix of Object.keys(HUB_FOLDERS)) {
    if (path.startsWith(prefix) && prefix.length > best.length) best = prefix
  }
  return best ? HUB_FOLDERS[best] : null
}
