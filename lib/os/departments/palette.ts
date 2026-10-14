/**
 * The colours a custom department can take. Validated against the built-in department,
 * team, HQ and discovered-folder colours (palette.test.ts holds the check), so a new
 * room's sign never reads as an existing one. Names are the accessible labels.
 */
export const DEPARTMENT_PALETTE = [
  { hex: "#dc2626", name: "Red" },
  { hex: "#b45309", name: "Copper" },
  { hex: "#0369a1", name: "Ocean" },
  { hex: "#be123c", name: "Rose" },
  { hex: "#0f766e", name: "Pine" },
  { hex: "#4d7c0f", name: "Moss" },
] as const

export const isPaletteColor = (c: unknown): c is string =>
  typeof c === "string" && DEPARTMENT_PALETTE.some((p) => p.hex === c.toLowerCase())
