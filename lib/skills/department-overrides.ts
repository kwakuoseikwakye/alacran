/**
 * Which department a user has filed a skill or command under, overriding the
 * one derived from the pack that ships it (lib/skills/departments.ts).
 *
 * localStorage, per browser — the same call components/reorderable-grid.tsx
 * already makes for card order, and for the same reason: this is how someone
 * likes their sidebar arranged, not something about the business. Nothing here
 * reaches the company repo, so filing a vendored skill under another department
 * needs no write to a file the app owns and updates.
 */
export const DEPARTMENTS_KEY = "alacran-skill-departments"

export type DepartmentOverrides = Record<string, string>

/**
 * An override equal to the derived department is deleted rather than stored.
 * Keeps the map to what the user actually changed, so a pack that later
 * recategorises a skill still moves it everywhere the user never intervened —
 * a stored "Marketing" that merely agreed with today's default would pin it
 * forever and look like a bug years later.
 */
export function nextOverrides(
  current: DepartmentOverrides,
  filePath: string,
  department: string,
  derived: string
): DepartmentOverrides {
  const next = { ...current }
  if (department === derived) delete next[filePath]
  else next[filePath] = department
  return next
}

export function loadDepartmentOverrides(): DepartmentOverrides {
  try {
    const raw = window.localStorage.getItem(DEPARTMENTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    // A hand-edited or half-written value must not take the page down with it.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as DepartmentOverrides) : {}
  } catch {
    return {}
  }
}

export function saveDepartmentOverrides(overrides: DepartmentOverrides): void {
  try {
    window.localStorage.setItem(DEPARTMENTS_KEY, JSON.stringify(overrides))
  } catch {
    // Private mode, or a full quota. The move still applies for this session.
  }
}
