// A starter pack is a small overlay on the one base skeleton in
// templates/company-starter/ — never a second full company tree. Concretely,
// each pack ships only: a filled-in example definitions/ontology/company.yaml
// shaped for that kind of business, and one or two .claude/commands/*.md
// files for the tasks that shape of company actually repeats.
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
    description: "Ships an ontology for repos, features, and releases, plus a /code-review and /plan-feature command.",
    dirName: "software-engineering",
    category: "Engineering",
  },
  {
    id: "sales",
    label: "Sales",
    description: "Ships an ontology for leads and accounts, plus a /follow-up-lead command.",
    dirName: "sales",
    category: "Sales",
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Ships an ontology for campaigns and offerings, plus a /draft-campaign command.",
    dirName: "marketing",
    category: "Marketing",
  },
  {
    id: "customer-support",
    label: "Customer support",
    description: "Ships an ontology for tickets and contacts, plus a /triage-ticket and /draft-response command.",
    dirName: "customer-support",
    category: "Support",
  },
  {
    id: "hr-people",
    label: "HR & People",
    description: "Ships an ontology for open roles and candidates, plus a /screen-candidate and /draft-offer command.",
    dirName: "hr-people",
    category: "HR & People",
  },
  {
    id: "leadership-team",
    label: "Leadership team",
    description: "A generalist, cross-functional ontology (finance, ops, people) plus a /weekly-briefing command.",
    dirName: "leadership-team",
    category: "Leadership",
  },
]

export const DEFAULT_COMPANY_STARTER_PACK_ID = COMPANY_STARTER_PACKS[0].id

export function getCompanyStarterPack(id: string | undefined): CompanyStarterPack {
  return COMPANY_STARTER_PACKS.find((p) => p.id === id) ?? COMPANY_STARTER_PACKS[0]
}
