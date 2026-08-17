// A starter pack is a small overlay on the one base skeleton in
// templates/company-starter/ — never a second full company tree. Concretely,
// each pack ships only: a filled-in example definitions/ontology/company.yaml
// shaped for that kind of business, one or two .claude/commands/*.md files for
// the tasks that shape of company actually repeats, and (marketing and
// hr-people so far) .claude/skills/ vendored from a pinned upstream tag by
// scripts/sync-vendored-skills.sh.
//
// Deliberately not a full duplicate per shape: everything else (hooks,
// rules, verify.py, docs) is identical for every company
// regardless of what it does, so it lives once in company-starter/ and a
// fix there fixes it for every pack at once — the same reasoning
// definitions-touch.md already applies to a single company's own data.
//
// `dirName: null` (General purpose) means "no overlay" — the plain base
// skeleton, exactly as it shipped before starter packs existed.
export type CompanyStarterPack = {
  id: string
  label: string
  /** One sentence shown under the label in the picker. */
  description: string
  /** Directory name under templates/packs/, or null for no overlay. */
  dirName: string | null
  /** Groups the picker + landing page into sections (e.g. "Engineering", "Sales"). */
  category: string
}

export const COMPANY_STARTER_PACKS: CompanyStarterPack[] = [
  {
    id: "general",
    label: "General purpose",
    description: "The plain starter. A blank ontology and the core commands — good for any shape of business.",
    dirName: null,
    category: "General",
  },
  {
    id: "software-engineering",
    label: "Software engineering",
    description:
      "Ships an ontology for repos, features, and releases, plus /plan-feature, /write-tests, /debug-issue, /code-review, and /prep-release commands — one for each stage from planning a feature to shipping it.",
    dirName: "software-engineering",
    category: "Engineering",
  },
  {
    id: "sales",
    label: "Sales",
    description:
      "Ships an ontology for leads and accounts, plus /follow-up-lead, /draft-proposal, and /pipeline-review commands — from one-to-one outreach to the whole pipeline.",
    dirName: "sales",
    category: "Sales",
  },
  {
    id: "marketing",
    label: "Marketing",
    description:
      "Ships an ontology for campaigns and offerings, /draft-campaign, /campaign-recap, and /campaign-status commands, plus 10 marketing skills (positioning, plan, copy, SEO, analytics, email, social, launch, CRO). Start with the product-marketing skill — the rest read the context it writes.",
    dirName: "marketing",
    category: "Marketing",
  },
  {
    id: "customer-support",
    label: "Customer support",
    description:
      "Ships an ontology for tickets and contacts, plus /triage-ticket, /draft-response, /escalate-ticket, and /ticket-trends commands — assess, reply, escalate, and spot recurring bugs.",
    dirName: "customer-support",
    category: "Support",
  },
  {
    id: "hr-people",
    label: "HR & People",
    description:
      "Ships an ontology for open roles and candidates, /screen-candidate, /draft-offer, /draft-rejection, and /hiring-pipeline-review commands, plus 12 HR skills covering the whole employee lifecycle — recruiting, job descriptions, interviewing, offers, onboarding, reviews, pay, employee relations, policy, compliance, engagement and offboarding.",
    dirName: "hr-people",
    category: "HR & People",
  },
  {
    id: "leadership-team",
    label: "Leadership team",
    description:
      "A generalist, cross-functional ontology (finance, ops, people) plus /weekly-briefing, /decision-prep, and /investor-update commands — what happened, what to decide, and the external update.",
    dirName: "leadership-team",
    category: "Leadership",
  },
]

export const DEFAULT_COMPANY_STARTER_PACK_ID = COMPANY_STARTER_PACKS[0].id

export function getCompanyStarterPack(id: string | undefined): CompanyStarterPack {
  return COMPANY_STARTER_PACKS.find((p) => p.id === id) ?? COMPANY_STARTER_PACKS[0]
}
