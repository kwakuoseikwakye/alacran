import type { Prospect } from "./prospects"

function escapeCsvCell(val: string | number | undefined): string {
  let str = String(val ?? "")
  if (/^[=+\-@\t]/.test(str)) {
    str = `'${str}`
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function sanitizeTsvCell(val: string | number | undefined): string {
  return String(val ?? "").replace(/\t|\r?\n/g, " ")
}

export function exportProspectsToCsv(prospects: Prospect[]): string {
  const headers = ["Company", "Contact Name", "Role", "Website", "Fit Score", "Value (USD)", "Status"]
  const rows = prospects.map((p) =>
    [
      escapeCsvCell(p.company),
      escapeCsvCell(p.name),
      escapeCsvCell(p.role),
      escapeCsvCell(p.url),
      escapeCsvCell(p.fitScore),
      escapeCsvCell(p.estimatedValue),
      escapeCsvCell(p.status),
    ].join(",")
  )

  return [headers.join(","), ...rows].join("\n")
}

export function exportProspectsToTsv(prospects: Prospect[]): string {
  const headers = ["Company", "Contact Name", "Role", "Website", "Fit Score", "Value (USD)", "Status"]
  const rows = prospects.map((p) =>
    [
      sanitizeTsvCell(p.company),
      sanitizeTsvCell(p.name),
      sanitizeTsvCell(p.role),
      sanitizeTsvCell(p.url),
      sanitizeTsvCell(p.fitScore),
      sanitizeTsvCell(p.estimatedValue),
      sanitizeTsvCell(p.status),
    ].join("\t")
  )

  return [headers.join("\t"), ...rows].join("\n")
}
