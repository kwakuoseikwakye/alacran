export function tailLines(content: string, maxLines: number): string {
  const lines = content.split("\n")
  return lines.slice(-maxLines).join("\n")
}
