import { parseCompanyOntology } from "@/lib/parse-company-ontology"

/**
 * The company profile, said as sentences.
 *
 * Approvals used to show `company.yaml` as its raw lines under a red "High
 * risk" chip, which is the most memory-shaped thing a first-time person is
 * asked to agree to and the least readable. This reads the same answers the
 * setup wizard wrote (parseCompanyOntology is its inverse) and says them back.
 *
 * Returns null for any other file, and for text that is not a profile it can
 * read (invalid YAML, a starter pack's example, no business described), so the
 * caller falls back to the raw preview rather than showing nothing. It is a
 * summary of the wizard's answers only: the customer/org/product sections are
 * not restated, which is why it points at Technical details.
 *
 * ponytail: names the wizard's five answers only. If drafts start carrying
 * other sections a person must agree to, list their top-level keys here.
 */
export function describeProfile(outputPath: string, text: string): string | null {
  if (!outputPath.endsWith("company.yaml")) return null
  const parsed = parseCompanyOntology(text)
  if (!parsed.ok || !parsed.answers.domain.trim()) return null
  const { domain, employeeCount, bottleneck, stakeholders, valueFlow } = parsed.answers

  const lines = [`Your business: ${domain.trim()}`]
  if (employeeCount !== undefined) lines.push(`People: ${employeeCount}`)
  if (bottleneck.trim()) lines.push(`Biggest bottleneck: ${bottleneck.trim()}`)

  const people = stakeholders
    .filter((s) => s.role.trim())
    .map((s) => (s.position.trim() ? `${s.role.trim()} (${s.position.trim()})` : s.role.trim()))
  if (people.length) lines.push(`Who is involved: ${people.join("; ")}`)

  const flow = [valueFlow.input, valueFlow.transform, valueFlow.output].map((s) => s.trim()).filter(Boolean)
  if (flow.length) lines.push(`How work flows: ${flow.join(", then ")}.`)

  lines.push("This is a summary of the main answers. Open Technical details to see every line.")
  return lines.join("\n")
}
