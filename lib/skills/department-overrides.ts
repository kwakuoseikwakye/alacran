/**
 * Which department a user has filed a skill or command under, overriding the
 * one derived from the pack that ships it (lib/skills/departments.ts).
 *
 * Only the rule lives here. The localStorage read/write is inline in the one
 * component that does it, the same shape components/reorderable-grid.tsx uses
 * for card order — and for the same reason: this is how someone likes their
 * sidebar arranged, not a fact about the business.
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
