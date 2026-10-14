import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const TABLE = path.join(ROOT, "lib/guide/executor-coverage.ts")
const IDS = ["claude-code", "codex", "kimi", "kiro", "google-antigravity"]
const VERDICTS = new Set(["follows", "partial", "does-not", "unverified"])

export function updateCoverageFromReport(jsonFile, markdownFile, source = fs.readFileSync(TABLE, "utf8"), write = true) {
  const reportPath = path.resolve(jsonFile)
  const markdownPath = path.resolve(markdownFile)
  const json = JSON.parse(fs.readFileSync(reportPath, "utf8"))
  const markdown = fs.readFileSync(markdownPath, "utf8")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(json.date) || !Array.isArray(json.reports) || json.reports.length === 0) throw new Error("Invalid report date or reports array")
  const evidence = path.relative(ROOT, markdownPath).split(path.sep).join("/")
  if (!/^docs\/guide-coverage\/\d{4}-\d{2}-\d{2}-report\.md$/.test(evidence)) throw new Error("Markdown evidence must be docs/guide-coverage/<date>-report.md")
  if (evidence !== `docs/guide-coverage/${json.date}-report.md` || path.basename(reportPath) !== `${json.date}-report.json`) throw new Error("JSON and Markdown evidence paths must use the report date")
  if (!markdown.includes(`Measured ${json.date}.`) || !markdown.includes("# Operating guide: executor coverage report")) throw new Error("Markdown evidence does not match the JSON date/report")
  let updated = source
  const seen = new Set()
  for (const row of json.reports) {
    if (!IDS.includes(row.id) || seen.has(row.id) || !VERDICTS.has(row.verdict)) throw new Error(`Invalid or duplicate executor/verdict: ${row.id}`)
    if (row.verdict !== "unverified" && (typeof row.cliVersion !== "string" || !row.cliVersion.trim())) throw new Error(`Measured row ${row.id} requires its exact CLI version`)
    seen.add(row.id)
    if (!markdown.includes(`| ${row.id} |`) || !markdown.includes(`| ${row.id} | ${row.cliVersion ?? "not found"} | ${row.verdict} |`)) throw new Error(`Markdown table is missing matching evidence for ${row.id}`)
    const value = row.verdict === "unverified"
      ? "UNVERIFIED"
      : `{ verdict: ${JSON.stringify(row.verdict)}, cliVersion: ${JSON.stringify(row.cliVersion)}, measuredOn: ${JSON.stringify(json.date)}, evidence: ${JSON.stringify(evidence)} } as const`
    const key = row.id.includes("-") ? `"${row.id}"` : row.id
    const block = new RegExp(`(^  ${key}: \\{[\\s\\S]*?^  \\},)`, "m")
    if (!block.test(updated)) throw new Error(`Could not locate total table entry ${row.id}`)
    updated = updated.replace(block, (entry) => entry.replace(/^    behaviour: .*,$/m, `    behaviour: ${value},`))
  }
  if (seen.size !== IDS.length) throw new Error("Merged report must contain every registered executor")
  if (write) fs.writeFileSync(TABLE, updated)
  return updated
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  if (process.argv.length !== 4) throw new Error("Usage: node scripts/update-guide-coverage.mjs <date-report.json> <date-report.md>")
  updateCoverageFromReport(process.argv[2], process.argv[3])
  console.log(`Updated ${TABLE}`)
}
