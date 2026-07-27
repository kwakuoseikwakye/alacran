# v18: guided company-context setup — design spec

Piece 2 of the roadmap toward a Fleece.ai-style onboarding UI (v17 shipped
piece 1: create a company from the template).

## Problem

A freshly-scaffolded company (v17) has an empty `definitions/ontology/`
skeleton — just a README, no `company.yaml`. Filling that in today means
running `/define-company` inside a Claude Code session: a fully
conversational flow that assumes the user is comfortable chatting with an
AI agent in a terminal. This dashboard's stated audience is **non-technical
people setting up their AI company** — they shouldn't need Claude Code
running just to describe their own business.

## Scope decision (confirmed with the user)

`/define-company` does two genuinely different things: (1) four
structured questions — business domain, stakeholders, value flow,
bottleneck — that map directly to form fields, and (2) using the AI
agent's own reasoning to *invent* industry-specific `customer`/`org`/
`product` domain entities (e.g. `labor_contract` for a labor consultancy,
`sku` for an e-commerce company). This dashboard has no AI-calling
infrastructure today — no API key handling, no completion calls anywhere.

**Decision:** v18 ships (1) only. The generated `company.yaml`'s
`customer`/`org`/`product` sections are copied unmodified from
`docs/templates/ontology-starter.yaml` (the same generic skeleton v17
already scaffolds into every new company) — present and structurally
valid, but not filled with real entities. Real AI-assisted entity
generation is deferred until after v19 (connect an agent), at which point
an already-connected agent — not new infrastructure this dashboard has to
build — can do that reasoning. This keeps v18 dependency-free and usable
the moment a company exists, instead of gating the very first setup step
on an AI connection nobody has made yet.

**Also confirmed:** this applies only to companies that don't have a
`company.yaml` yet (freshly scaffolded, e.g. via v17). Editing an
already-filled ontology (pre-filling a form from existing YAML, handling
partial/malformed files) is a different, harder problem, deferred to a
later slice.

## UI shape (confirmed with the user)

A step-by-step wizard, one question per screen — matching
`/define-company`'s own explicit design choice ("ask one at a time, don't
overwhelm") and better suited to a non-technical audience than a single
long form. Screens, each with Back/Next:

1. **About your company** — business domain (what problem do you solve?,
   required, multi-line) + employee count (optional, number).
2. **Stakeholders** — repeatable rows of `{ role, position }`; at least
   one required; add/remove rows.
3. **Value flow** — three short fields: input (what you receive),
   transform (what you do), output (what you deliver). All required.
4. **Biggest bottleneck** — free text, required: what's the most
   time-consuming or tribal-knowledge-dependent work right now?
5. **Review & save** — a friendly, plain-language recap of everything
   entered above (not raw YAML — this audience shouldn't need to read
   YAML to confirm their own answers), with a "Save" button. Nothing is
   written to disk before this step.

**Entry point:** a new "Set up your company" button on `AgentCard`,
shown whenever an agent is `kind === "command-set"` **and** its
`definitions/ontology/company.yaml` doesn't exist yet — computed
server-side in `app/page.tsx` alongside the existing avatar lookup, no
new client-side round-trip needed just to decide whether to show the
button. This condition is agent-agnostic (not hardcoded to "only
registered companies") — it would just as correctly stay hidden for
`ai-company-starter-main`, which already has a real `company.yaml`.
Clicking it opens the wizard in a `Sheet`, matching this project's
existing detail-view pattern (Activity, Skills).

## Data flow and new dependency

**New dependency: the `yaml` npm package.** The wizard's answers are
free text — a business description containing a colon, a quote, or a
newline would produce invalid YAML if hand-templated as a raw string
(this project's usual pattern for generated files, e.g. v17's
`FRESH_HANDOFF_CONTENT`). Correct YAML escaping regardless of user input
requires a real parser/serializer, not string interpolation. `yaml` is
small, has zero dependencies of its own, and is the de facto standard
choice for this in the Node ecosystem.

Flow: a pure function `buildCompanyOntology(companyName, answers,
ontologyStarterYamlContent)` parses `docs/templates/ontology-starter.yaml`
(already present in every v17-scaffolded company) to extract its
`customer`/`org`/`product` objects, combines them with the wizard's
answers into `company_summary` / `stakeholders` / `value_flow`, and
serializes the combined object back to YAML. This function takes the
template's raw content as a parameter (not a file path) — fully pure, no
I/O, trivially unit-testable with a small inline fixture string instead
of reading any real file. A separate impl function handles the I/O:
resolve the target company's `rootPath` **server-side** by looking up the
given `agentId` in the existing `getEffectiveAgents()` (never trusting a
client-supplied path), read the real `ontology-starter.yaml`, call
`buildCompanyOntology`, write `definitions/ontology/company.yaml`, and
commit it via the existing, already-tested `commitFile()` from
`lib/git-commit-file.ts` (single-file-scoped `git add` + `git commit`,
exactly like `saveSkillContentImpl` already does for skill edits).

## Non-goals

- No AI-generated `customer`/`org`/`product` entities — see Scope
  decision above; deferred until an agent connection exists (v19+).
- No editing of an already-filled `company.yaml` — this slice only
  handles the "doesn't exist yet" case.
- No changes to `/define-company` itself, or to any file under
  `ai-company-starter-main` — this feature operates on registered
  companies' own directories (or, in principle, any command-set agent
  missing a `company.yaml`, though in practice that's always a
  freshly-scaffolded company today).
- No changes to `lib/companies-registry.ts`, `lib/register-company.ts`,
  `lib/create-company-from-template*.ts` — v17's flow is untouched.
- No progress persistence across page reloads (closing the wizard
  mid-way discards answers, same as this project's other unsaved-form
  conventions, e.g. `AddCompanyForm`).

## Testing

`buildCompanyOntology` is pure and gets full unit coverage: valid YAML
output for a full set of answers (parseable back via the same `yaml`
library, asserting the specific fields land in the right places);
correct handling of an omitted employee count (key absent, not an empty
string); multiple stakeholders; and the one genuinely important
correctness case — a business-domain description containing YAML-special
characters (a colon, a quote) round-trips correctly instead of producing
broken output. The I/O-layer impl function is tested against disposable
`/tmp` fixtures (a fake company directory with its own
`docs/templates/ontology-starter.yaml`), never the real
`ai-company-starter-main`, per this project's standing safe-test-target
rule. Live verification: run the wizard against a disposable `/tmp`
company created via v17's own flow, confirm the "Set up your company"
button disappears once `company.yaml` exists, confirm the file is valid
YAML with the right structure, confirm exactly one new commit, then clean
up.
