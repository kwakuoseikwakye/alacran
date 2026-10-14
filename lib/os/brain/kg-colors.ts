/**
 * Theme-remappable knowledge-graph colors.
 */
const HEX6 = /^#([0-9a-fA-F]{6})$/

export function themedNodeColor(color: string): string {
  const m = HEX6.exec(color)
  return m ? `var(--kg-c-${m[1].toLowerCase()}, ${color})` : color
}
