import { isPaletteColor } from "./palette"

export const BUILT_IN_SLUGS = ["funnel", "comms", "content", "social", "finances"] as const
/** Folders under records/ that the app itself writes and shows on their own pages. */
export const APP_OWNED_SLUGS = ["workflows", "roadmap"] as const
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([...BUILT_IN_SLUGS, ...APP_OWNED_SLUGS, "company", "archive"])
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_NAME = 40
export const MAX_PURPOSE = 200

export type DepartmentFields = { name: string; purpose: string; color: string }

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_NAME)
    .replace(/-+$/g, "")
}

/**
 * The slug for a new department. A name with Latin letters or digits gets its own slug
 * (reserved ones are refused). A name with none gets department, department-2, … so
 * the folder is never empty-named and the result is deterministic.
 */
export function pickSlug(name: string, taken: ReadonlySet<string>): string | { error: string } {
  const base = slugify(name)
  if (base) return RESERVED_SLUGS.has(base) ? { error: `"${base}" is reserved. Pick a different name.` } : base
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? "department" : `department-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

const CONTROL = /[\u0000-\u001f\u007f]/

export function validateFields(input: {
  name?: unknown
  purpose?: unknown
  color?: unknown
}): { ok: true; value: DepartmentFields } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : ""
  const purpose = typeof input.purpose === "string" ? input.purpose.trim() : ""
  if (!name) return { ok: false, error: "Give the department a name." }
  if (name.length > MAX_NAME) return { ok: false, error: `Keep the name to ${MAX_NAME} characters or fewer.` }
  if (/[/\\]/.test(name)) return { ok: false, error: "The name can't contain a slash." }
  if (name.startsWith(".")) return { ok: false, error: "The name can't start with a dot." }
  if (CONTROL.test(name)) return { ok: false, error: "The name must be a single line." }
  if (!purpose) return { ok: false, error: "Say what this department is for." }
  if (purpose.length > MAX_PURPOSE) return { ok: false, error: `Keep the purpose to ${MAX_PURPOSE} characters or fewer.` }
  if (CONTROL.test(purpose)) return { ok: false, error: "The purpose must be a single line." }
  if (!isPaletteColor(input.color)) return { ok: false, error: "Pick one of the colours offered." }
  return { ok: true, value: { name, purpose, color: input.color.toLowerCase() } }
}
