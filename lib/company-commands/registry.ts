import type { CompanyCommand } from "./types"

export const COMPANY_COMMANDS: CompanyCommand[] = [
  {
    id: "digest",
    commandFileName: "digest.md",
    label: "Weekly digest",
    fields: [
      {
        key: "period",
        label: "Period (optional — defaults to the last 7 days)",
        required: false,
        multiline: false,
        placeholder: "e.g. last 7 days",
      },
    ],
    outputKind: "new-file-in-dir",
    outputPath: "notes/company/digests",
    needsPrefetch: false,
    buildPrompt: (fields, today) => `Run this repository's /digest command as described in .claude/commands/digest.md.

Today's date is ${today}. Aggregate scope: ${fields.period?.trim() || "the last 7 days"}.

Scan notes/company/**/*.md (excluding notes/company/digests/), notes/market/**/*.md, notes/clients/**/*.md, notes/sops/**/*.md, docs/decisions/*.md, and docs/retros/*.md for frontmatter created:/updated: dates within the aggregate scope. Count unprocessed notes in notes/inbox/ (excluding README.md) and flag any older than 7 days. Flag any notes/market/**/*.md whose observed_at: is more than 90 days old.

Write the result to notes/company/digests/${today}-digest.md following the exact template structure in .claude/commands/digest.md's "進め方" step 5 (frontmatter with type: digest, status: active, created/updated: ${today}, tags: []; a warning banner that this file is aggregated output, not source of truth; sections for new/updated notes by category, inbox backlog, market freshness warnings, and suggested next actions). Create notes/company/digests/ first if it doesn't exist. Write exactly one file and stop — do not run any other commands.`,
  },
  {
    id: "decision",
    commandFileName: "decision.md",
    label: "Record a decision (RFC)",
    fields: [
      { key: "context", label: "Context", required: true, multiline: true, placeholder: "What situation or constraint made this decision necessary?" },
      { key: "decision", label: "Decision", required: true, multiline: true, placeholder: "What was decided? State it as one clear sentence." },
      { key: "rationale", label: "Rationale", required: true, multiline: true, placeholder: "Why is this the best choice?" },
      { key: "alternatives", label: "Alternatives considered", required: true, multiline: true, placeholder: "What else was considered, and why wasn't it chosen?" },
      { key: "consequences", label: "Consequences", required: true, multiline: true, placeholder: "What changes as a result, good and bad?" },
    ],
    outputKind: "new-file-in-dir",
    outputPath: "docs/decisions",
    needsPrefetch: false,
    buildPrompt: (fields, today) => `Run this repository's /decision command as described in .claude/commands/decision.md.

Today's date is ${today}. Generate a short slug (alphanumeric and hyphens only, 2-4 words) summarizing the decision below, and write docs/decisions/${today}-<slug>.md with this frontmatter and structure:

---
date: ${today}
status: proposed
type: decision
created: ${today}
updated: ${today}
tags: []
---

# <a short title for the decision>

## Context

${fields.context}

## Decision

${fields.decision}

## Rationale

${fields.rationale}

## Alternatives Considered

${fields.alternatives}

## Consequences

${fields.consequences}

Leave status as "proposed" — there is no user available in this run to confirm "accepted." Write exactly one file and stop — do not run any other commands.`,
  },
  {
    id: "retro",
    commandFileName: "retro.md",
    label: "Retrospective (KPT)",
    fields: [
      { key: "keep", label: "Keep — what worked, what should continue", required: true, multiline: true },
      { key: "problem", label: "Problem — what got stuck or was inefficient", required: true, multiline: true },
      { key: "try", label: "Try — 1-3 improvements for next cycle", required: true, multiline: true },
    ],
    outputKind: "new-file-in-dir",
    outputPath: "docs/retros",
    needsPrefetch: false,
    buildPrompt: (fields, today) => `Run this repository's /retro command as described in .claude/commands/retro.md.

Today's date is ${today}. If docs/templates/retrospective-template.yaml exists, read it for structure context, but proceed even if it doesn't. Write docs/retros/${today}-retro.md (creating docs/retros/ first if needed) with this frontmatter and structure:

---
type: retro
status: active
created: ${today}
updated: ${today}
tags: []
---

# Retro ${today}

## Keep

- ${fields.keep}

## Problem

- ${fields.problem}

## Try

- ${fields.try}

## Next actions

- [ ] <turn the Try items above into concrete next actions>

Be honest in Problem — don't varnish over what didn't work. Write exactly one file and stop — do not run any other commands.`,
  },
  {
    id: "define-company",
    commandFileName: "define-company.md",
    label: "Define company ontology",
    fields: [
      { key: "domain", label: "Business domain — what problem does the company solve?", required: true, multiline: true },
      { key: "stakeholders", label: "Key stakeholders — who are the customers/employees/partners and their roles?", required: true, multiline: true },
      { key: "valueFlow", label: "Core value flow — input, transform, output", required: true, multiline: true },
      { key: "bottleneck", label: "Current biggest bottleneck", required: true, multiline: true },
    ],
    outputKind: "known-file",
    outputPath: "definitions/ontology/company.yaml",
    needsPrefetch: false,
    buildPrompt: (fields, today) => `Run this repository's /define-company command as described in .claude/commands/define-company.md.

Read docs/templates/ontology-starter.yaml first for the customer/org/product 3-domain structure this file should follow. Do not edit that template — only write definitions/ontology/company.yaml.

Business domain: ${fields.domain}
Key stakeholders: ${fields.stakeholders}
Core value flow: ${fields.valueFlow}
Current biggest bottleneck: ${fields.bottleneck}

Today's date is ${today}. Write definitions/ontology/company.yaml following the starter template's structure (version, schema_version: "${today}-company", template_origin, status: draft, company_summary, stakeholders, value_flow, then customer/org/product domains filled in from the answers above). Do not write real names, amounts, or contact details directly into attributes — use band expressions (e.g. amount_band) for money and keep genuinely sensitive data out of this file. It is fine to leave some fields as a best-effort draft (status: draft) if the answers above don't fully cover every field. Write exactly one file and stop — do not run any other commands, and do not attempt to git add or commit anything.`,
  },
  {
    id: "handoff",
    commandFileName: "handoff.md",
    label: "Session handoff",
    fields: [
      { key: "blockers", label: "Blockers (optional — leave blank if none)", required: false, multiline: true },
    ],
    outputKind: "known-file",
    outputPath: "HANDOFF.md",
    needsPrefetch: true,
    buildPrompt: (fields, today, prefetch) => `Run this repository's /handoff command as described in .claude/commands/handoff.md.

Today's date is ${today}. You have no Bash access in this run, so here is the pre-fetched context you'd otherwise gather yourself:

${prefetch}

If HANDOFF.md exists, read it first and append a new dated section at the end without disturbing existing sections (if there's already a section for today's date, add a "(2)" suffix to the new heading instead of duplicating it). If it doesn't exist, create it.

Add a section:

## ${today}

### Done today
<summarize the git log above>

### In flight
<work started but not finished, if inferable from the log/issues above — otherwise "None apparent from available context">

### Next up
<open issues from the list above, prioritized, or "None apparent from available context">

### Blockers
${fields.blockers?.trim() || "None (autonomous run — not confirmed with a user; verify and correct if inaccurate)"}

Do not move or archive older sections to a separate file even if there are more than 5 — just append the new section and leave everything else as-is; archival rotation is a manual/interactive-session task outside this run's scope. Write the file and stop — do not run any other commands, and do not attempt to git add or commit anything.`,
  },
]

export function getCompanyCommand(id: string): CompanyCommand | undefined {
  return COMPANY_COMMANDS.find((c) => c.id === id)
}
