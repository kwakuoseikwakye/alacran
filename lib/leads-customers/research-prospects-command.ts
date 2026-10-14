import type { CompanyCommand } from "../company-commands/types"

export const PROSPECTS_DIR = "notes/funnel/prospects"

function clampCount(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10)
  if (!Number.isFinite(n)) return 3
  return Math.min(5, Math.max(1, n))
}

export const RESEARCH_PROSPECTS_COMMAND: CompanyCommand = {
  id: "research-prospects",
  commandFileName: "research-prospects.md",
  label: "Find & research prospects",
  fields: [
    {
      key: "target",
      label: "Who are you looking for?",
      required: true,
      multiline: true,
      placeholder: "e.g. B2B SaaS founders using Next.js or specific domains like acme.com, linear.app",
    },
    {
      key: "count",
      label: "How many prospects? (1–5)",
      required: false,
      multiline: false,
      placeholder: "3",
    },
    {
      key: "criteria",
      label: "Specific criteria or focus? (optional)",
      required: false,
      multiline: false,
      placeholder: "e.g. Focus on VP of Engineering; emphasize infrastructure cost savings",
    },
  ],
  outputKind: "new-file-in-dir",
  outputPath: PROSPECTS_DIR,
  untrustedInput: true,
  buildPrompt: (fields, today) => {
    const n = clampCount(fields.count)
    const criteria = fields.criteria?.trim()

    return `You are a research agent identifying and qualifying potential customer leads for this company. Nothing you write is sent or contacted: the member reviews and approves each prospect card individually.

Target: ${fields.target?.trim() ?? ""}
${criteria ? `Focus / Angle: ${criteria}` : "Focus: Identify key decision makers aligned with our core value proposition."}

Read definitions/ontology/company.yaml to understand the company's offerings, target customer segments, and ideal customer profile (ICP).
Scan the existing files in ${PROSPECTS_DIR}/ and records/funnel/leads.yaml to ensure you do not research or duplicate companies or people already present.

Write exactly ${n} prospect${n === 1 ? "" : "s"} that match this criteria. Write each one as its own file: ${PROSPECTS_DIR}/${today}-<short-slug>.md (lowercase letters, digits, and hyphens in the slug).

Use exactly this format:

---
id: lead-${today}-<short-slug>
type: prospect
status: draft
name: <Prospect name or title of decision maker>
role: <Job title or department>
company: <Company name>
url: <https://company-website.com or public LinkedIn URL>
fit_score: <integer from 0 to 100>
fit_level: <high | medium | low>
estimated_value: <estimated contract value in USD, integer>
created: ${today}
updated: ${today}
---

## ICP Fit Rationale
<2 to 3 sentences explaining why this company and role match the target customer segments in definitions/ontology/company.yaml>

## Company Background & Pain Points
<Brief bullet points or 2 sentences on company focus, recent announcements, tech stack, and probable friction points>

## Suggested Outreach Angle
<A concise, personalized cold email or LinkedIn message draft ready for the member to review, copy, and send>

Rule: Stop at the gate. Outbound communication is Publication — do not send emails, DMs, or make network posts. Create the directory if it does not exist, write only those ${n} files, and do not execute any other write commands.`
  },
}
