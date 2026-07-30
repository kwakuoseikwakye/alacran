# Starter Template Expansion + Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the control-panel's starter company templates from 4 to 7,
organized into categories (General / Engineering / Sales / Marketing /
Support / HR & People / Leadership), group the in-app picker by category, and
rewrite the landing page's stale "more starters soon" templates page to name
what's actually shipped.

**Architecture:** Each pack is a small overlay directory under
`templates/packs/<dir>/` (an ontology yaml + 1-2 `.claude/commands/*.md`
files) copied on top of the shared `templates/company-starter/` base skeleton
by the existing `createCompanyFromTemplate` flow — no changes to that copy
mechanism itself. `lib/company-starter-packs.ts` is the single source of
truth for the pack list (id/label/description/dirName/category) that both
`components/add-company-form.tsx` (in-app picker) and, manually mirrored,
`landing/templates/index.html` (marketing copy) read from.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Vitest, plain static HTML
for `landing/`.

## Global Constraints

- **Do not modify** `general`, `software-engineering`, or `leadership-team`'s
  existing pack content (per the spec's "Out of scope").
- **Do not build** a dedicated in-app template gallery page, category filter
  tabs, fake usage metrics, integration badges, or Popular/New badges — the
  spec explicitly rejects Fleece's full UI in favor of the simpler
  grouped-grid (see spec's "Out of scope").
- **Never write to, commit in, or otherwise mutate `~/AI-Native/plh-takeshi-agent`
  or `~/AI-Native/plh-ops` directly** — this project's standing safety rule
  (`CLAUDE.md`). Live verification in this plan only ever touches disposable
  `/tmp` directories.
- **`templates/company-starter/scripts/verify.py`'s `ONTOLOGY-01` check**
  only requires an ontology yaml's top level to contain at least one of
  `customer` / `org` / `product` — new packs do not need all three domains.
- Every new/changed `.claude/commands/*.md` file must follow the existing
  packs' voice: grounded-not-generic drafting, an explicit "never
  sends/finalizes/decides" boundary, and a pointer to
  `.claude/rules/hitl-gate.md` or `.claude/rules/definitions-touch.md` where
  a trigger in those rules genuinely applies.
- Run `npx tsc --noEmit`, `npx vitest run`, and `npm run build` after every
  code task; all three must stay clean throughout.
- This project's own workflow (`CLAUDE.md`) runs each slice in its own git
  worktree (`.claude/worktrees/control-panel-v30-<slug>/`, branch
  `worktree-control-panel-v30-<slug>`) — set this up before Task 1 if your
  execution skill doesn't already do so.

---

### Task 1: Add `category` to the pack registry and expand to 7 packs

**Files:**
- Modify: `lib/company-starter-packs.ts`
- Modify: `lib/company-starter-packs.test.ts`

**Interfaces:**
- Produces: `CompanyStarterPack` gains a `category: string` field. Final
  `COMPANY_STARTER_PACKS` array (order matters — later tasks and the UI
  grouping rely on this order to decide category display order):
  `general` (category `"General"`), `software-engineering` (`"Engineering"`),
  `sales` (`"Sales"`, **new id**), `marketing` (`"Marketing"`, **new id**),
  `customer-support` (`"Support"`, **new**), `hr-people` (`"HR & People"`,
  **new**), `leadership-team` (`"Leadership"`). The `marketing-sales` id is
  removed from this array (its directory is deleted in Task 2).
- Consumes: nothing new — this task only touches the registry file itself.

- [ ] **Step 1: Replace `CompanyStarterPack` and `COMPANY_STARTER_PACKS` in `lib/company-starter-packs.ts`**

Replace the `export type CompanyStarterPack` and `export const COMPANY_STARTER_PACKS` blocks with:

```ts
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
```

Leave the file's top comment block, `DEFAULT_COMPANY_STARTER_PACK_ID`, and
`getCompanyStarterPack` untouched.

- [ ] **Step 2: Add a category test to `lib/company-starter-packs.test.ts`**

Add this `it` inside the existing `describe("COMPANY_STARTER_PACKS", ...)` block:

```ts
  it("gives every pack a non-empty category", () => {
    for (const pack of COMPANY_STARTER_PACKS) {
      expect(pack.category.trim().length).toBeGreaterThan(0)
    }
  })
```

- [ ] **Step 3: Run the test suite**

Run: `npx vitest run lib/company-starter-packs.test.ts`
Expected: all tests pass, including the existing `getCompanyStarterPack("software-engineering").label` assertion (unaffected) and the new category test.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`components/add-company-form.tsx` still compiles against the old flat-array shape until Task 5 — adding a field is additive and doesn't break existing `.map()` usage.)

- [ ] **Step 5: Commit**

```bash
git add lib/company-starter-packs.ts lib/company-starter-packs.test.ts
git commit -m "Expand starter pack registry to 7 categorized packs"
```

---

### Task 2: Split `marketing-sales` into `sales` and `marketing` pack directories

**Files:**
- Create: `templates/packs/sales/definitions/ontology/company.yaml`
- Create: `templates/packs/sales/.claude/commands/follow-up-lead.md`
- Create: `templates/packs/marketing/definitions/ontology/company.yaml`
- Create: `templates/packs/marketing/.claude/commands/draft-campaign.md`
- Delete: `templates/packs/marketing-sales/` (entire directory)

**Interfaces:**
- Consumes: Task 1's `COMPANY_STARTER_PACKS` entries `sales` (`dirName:
  "sales"`) and `marketing` (`dirName: "marketing"`) — this task supplies the
  directories those `dirName`s point at.
- Produces: two pack directories `createCompanyFromTemplateImpl` (unchanged)
  can copy from.

- [ ] **Step 1: Create the Sales pack ontology**

Create `templates/packs/sales/definitions/ontology/company.yaml`:

```yaml
# Sales starter ontology — a filled-in starting point, not a blank
# template. Split out from the original combined Marketing & Sales pack —
# this half covers the customer-facing pipeline (leads through to paying
# accounts). Replace the example values with your own; keep the shape
# (customer / org / product, lowercase + dot-separated ids) since
# templates/company-starter/scripts/verify.py's ONTOLOGY-01 check and the
# rest of this starter both assume it.

version: 1
schema_version: "2026-07-30-template"
template_origin: templates/packs/sales/definitions/ontology/company.yaml
status: draft

# ============================================================
# Domain 1: customer
# ============================================================
customer:
  domain: customer
  primary_owner_candidates:
    - Sales rep

  entities:
    - id: customer.lead
      type: lead
      name: Lead
      description: Someone who showed interest but hasn't signed yet.
      attributes:
        name: string
        source: enum  # inbound / outbound / referral / event
        stage: enum  # new / contacted / qualified / proposal_sent / won / lost
        last_contacted_at: date
      tags: [primary, gtm-target]

    - id: customer.account
      type: account
      name: Customer account
      description: A lead that converted — an active or past paying customer.
      attributes:
        name: string
        plan: string
        started_at: date
        status: enum  # active / paused / churned
      tags: [primary]

    - id: customer.contact
      type: person
      name: Contact
      description: A specific person at a lead's or customer's organization.
      attributes:
        name: string
        role: string
        email: string
        preferred_channel: enum  # email / call / chat
      tags: [primary]

# ============================================================
# Domain 2: org
# ============================================================
org:
  domain: org
  primary_owner_candidates:
    - Head of sales

  entities:
    - id: org.role
      type: role
      name: Role
      description: A sales function.
      attributes:
        name: string  # e.g. sales rep, account executive
        responsibilities: list
      tags: [primary]

# ============================================================
# Template Acceptance
# ============================================================
template_acceptance:
  - Defines 2 domains (customer + org)
  - Shaped for a leads-and-accounts business rather than a generic one
  - Naming convention = lowercase + dot-separated, matching the base starter
```

- [ ] **Step 2: Move the Sales command over verbatim**

Create `templates/packs/sales/.claude/commands/follow-up-lead.md` with exactly this content (identical to the current `templates/packs/marketing-sales/.claude/commands/follow-up-lead.md` — copy it byte-for-byte, do not paraphrase):

```markdown
---
name: follow-up-lead
description: Draft a personalized follow-up for a specific lead, based on the actual notes/conversation history you have on them — not a generic "just checking in" template
---

# /follow-up-lead

Draft a follow-up message for one specific lead or contact, using what's actually known about
them rather than a generic template.

## How to proceed

1. Ask which lead or contact this is for, if not already given (a name, or a
   `customer.lead`/`customer.contact` id from `definitions/ontology/`).
2. Gather what's actually known:
   - Check `notes/clients/<slug>/` for any prior meeting notes or conversation history.
   - Check the lead's `stage` in the ontology (new / contacted / qualified / proposal_sent) —
     the right follow-up is different for someone who just downloaded something versus someone
     waiting on a proposal.
3. Draft a message that **references something specific from the actual history** (their last
   question, a concern they raised, something they mentioned about their own business) rather
   than "just wanted to follow up." A follow-up that could have been sent to anyone is worse
   than no follow-up.
4. Keep it short and end with one clear, low-friction next step (a specific question, a
   proposed time, not "let me know if you have any questions").
5. Show the draft to the user. **Never send it yourself** — this drafts the message only; the
   user sends it through their own email or CRM.

## Notes

- If there's no real history to draw on yet (a brand-new lead), say so rather than inventing
  detail that isn't there — draft a genuine first-touch message instead of faking familiarity.
- Don't write anything into `notes/` that contains a lead's real financial details or contract
  terms beyond an order-of-magnitude — see `.claude/rules/definitions-touch.md` for where that
  kind of detail belongs instead.
```

- [ ] **Step 3: Create the Marketing pack ontology**

Create `templates/packs/marketing/definitions/ontology/company.yaml`:

```yaml
# Marketing starter ontology — a filled-in starting point, not a blank
# template. Split out from the original combined Marketing & Sales pack —
# this half covers campaigns and what's being offered. Replace the example
# values with your own; keep the shape (customer / org / product, lowercase
# + dot-separated ids) since templates/company-starter/scripts/verify.py's
# ONTOLOGY-01 check and the rest of this starter both assume it.

version: 1
schema_version: "2026-07-30-template"
template_origin: templates/packs/marketing/definitions/ontology/company.yaml
status: draft

# ============================================================
# Domain 1: org
# ============================================================
org:
  domain: org
  primary_owner_candidates:
    - Head of marketing

  entities:
    - id: org.role
      type: role
      name: Role
      description: A marketing function.
      attributes:
        name: string  # e.g. campaign manager, content lead
        responsibilities: list
      tags: [primary]

# ============================================================
# Domain 2: product
# ============================================================
product:
  domain: product
  primary_owner_candidates:
    - Head of marketing

  entities:
    - id: product.campaign
      type: campaign
      name: Campaign
      description: A time-boxed push around one message, offer, or channel.
      attributes:
        name: string
        channel: enum  # email / social / paid_ads / content / event
        goal: string
        status: enum  # planned / running / done
        starts_at: date
        ends_at: date
      tags: [primary]

    - id: product.offering
      type: offering
      name: Offering
      description: What's actually being sold.
      attributes:
        name: string
        pricing_model: enum  # one_time / monthly / annual / usage
      tags: [primary]

# ============================================================
# Template Acceptance
# ============================================================
template_acceptance:
  - Defines 2 domains (org + product)
  - Shaped for a campaigns-and-offerings business rather than a generic one
  - Naming convention = lowercase + dot-separated, matching the base starter
```

- [ ] **Step 4: Move the Marketing command over verbatim**

Create `templates/packs/marketing/.claude/commands/draft-campaign.md` with exactly this content (identical to the current `templates/packs/marketing-sales/.claude/commands/draft-campaign.md`):

```markdown
---
name: draft-campaign
description: Draft a marketing campaign brief (audience, channel, message, CTA) from a short prompt describing the goal, using this company's own ontology and voice — not a generic template filled with placeholders
---

# /draft-campaign

Turn a rough goal ("get more signups before the end of the month", "announce the new pricing")
into a real campaign brief, grounded in what this company actually is — not a generic
fill-in-the-blank template.

## How to proceed

1. Read `definitions/ontology/company.yaml` first. The audience, offering, and tone should come
   from what's actually there (the `customer` and `product` domains), not be invented fresh
   each time.
2. Ask the user anything genuinely missing before drafting: the goal, the target segment (a
   specific `customer.lead`/`customer.account` slice if one applies), and which channel
   (`product.campaign.channel`: email / social / paid_ads / content / event).
3. Draft the brief:
   - **Goal**: one sentence, ideally with a number attached (e.g. "50 trial signups by the
     15th"), not just "raise awareness."
   - **Audience**: who specifically this is for, and why they'd care right now.
   - **Message**: the one thing the campaign wants the audience to believe or feel.
   - **Channel & format**: where it runs and what it looks like there (a subject line for
     email, a hook for social, an ad's headline + body for paid).
   - **Call to action**: the exact next step you want the reader to take.
4. Write the actual draft copy for the chosen channel, in the voice `definitions/ontology/company.yaml`
   implies — not marketing-generic language if that's not how this company actually talks.
5. Offer to save it: either as a new entry under `product.campaign` in the ontology (if the
   user wants to track it as a real campaign) or as a note in `notes/company/` if it's just a
   draft for now.

## Notes

- This drafts copy; it never sends anything or posts to any real channel on its own.
- If the campaign involves a price change, a new contract term, or anything else that matches
  a trigger in `.claude/rules/hitl-gate.md`, say so and get approval before treating it as final.
```

**Note:** this file references `customer.lead`/`customer.account` in step 2
of its own instructions even though the Marketing pack's ontology no longer
defines that domain — leave this as-is. The command still works correctly
when a company has *both* the Sales and Marketing packs' concepts in play
(e.g. a company that ran `/define-company` broadly), and degrades gracefully
(the command's own step 1 says to read the ontology first) when it doesn't.
Do not edit this command's wording as part of this task — that would be an
unrequested content change beyond the spec's scope.

- [ ] **Step 5: Delete the old combined pack directory**

```bash
git rm -r templates/packs/marketing-sales
```

- [ ] **Step 6: Verify with a disposable live company creation**

Per this project's standing safety rule, only use a freshly-created,
self-destroyed `/tmp` directory for this check.

```bash
npx tsx -e "
import { createCompanyFromTemplateImpl } from './lib/create-company-from-template-impl'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

async function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-check-'))
  const registryPath = path.join(tmp, 'registry.json') // disposable — never the real dataPath('companies.json')
  for (const dir of ['sales', 'marketing']) {
    const rootPath = path.join(tmp, dir)
    const bundled = path.join(process.cwd(), 'templates', 'company-starter')
    const packSource = path.join(process.cwd(), 'templates', 'packs', dir)
    const result = await createCompanyFromTemplateImpl('Test ' + dir, rootPath, bundled, packSource, registryPath)
    console.log(dir, result.ok, fs.existsSync(path.join(rootPath, 'definitions/ontology/company.yaml')))
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}
run()
"
```

**Important:** the 5th argument (`registryPath`) must be passed explicitly —
`createCompanyFromTemplateImpl`'s default `registryPath` is
`dataPath("companies.json")`, the **real** registry this dev machine's
dashboard reads. Omitting it would register throwaway "Test sales" /
"Test marketing" companies into your actual, real company list. Always pass
a path inside the disposable `tmp` directory.

Expected: both `sales` and `marketing` print `true true` and no errors. This
confirms `createCompanyFromTemplateImpl` (unchanged) correctly layers each new
pack directory onto the base skeleton.

- [ ] **Step 7: Run the full checks**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean (the `company-starter-packs.test.ts` assertions from Task 1
already cover the new ids; no test references `marketing-sales` directly —
confirm with `grep -rn "marketing-sales" lib/ components/ --include=*.ts --include=*.tsx`
returning nothing).

- [ ] **Step 8: Commit**

```bash
git add templates/packs/sales templates/packs/marketing
git commit -m "Split the Marketing & Sales pack into separate Sales and Marketing packs"
```

---

### Task 3: Add the Customer support pack

**Files:**
- Create: `templates/packs/customer-support/definitions/ontology/company.yaml`
- Create: `templates/packs/customer-support/.claude/commands/triage-ticket.md`
- Create: `templates/packs/customer-support/.claude/commands/draft-response.md`

**Interfaces:**
- Consumes: Task 1's `customer-support` pack entry (`dirName:
  "customer-support"`).
- Produces: a pack directory `createCompanyFromTemplateImpl` can copy from.

- [ ] **Step 1: Create the ontology**

Create `templates/packs/customer-support/definitions/ontology/company.yaml`:

```yaml
# Customer support starter ontology — a filled-in starting point, not a
# blank template. Replace the example values with your own; keep the shape
# (customer / org / product, lowercase + dot-separated ids) since
# templates/company-starter/scripts/verify.py's ONTOLOGY-01 check and the
# rest of this starter both assume it.

version: 1
schema_version: "2026-07-30-template"
template_origin: templates/packs/customer-support/definitions/ontology/company.yaml
status: draft

# ============================================================
# Domain 1: customer
# ============================================================
customer:
  domain: customer
  primary_owner_candidates:
    - Support agent

  entities:
    - id: customer.contact
      type: person
      name: Contact
      description: The person who raised a support ticket.
      attributes:
        name: string
        email: string
        preferred_channel: enum  # email / chat / phone
      tags: [primary]

    - id: customer.ticket
      type: ticket
      name: Support ticket
      description: One reported issue or question from a customer.
      attributes:
        subject: string
        channel: enum  # email / chat / phone / social
        priority: enum  # low / medium / high / urgent
        status: enum  # open / pending / resolved
        opened_at: date
      tags: [primary]

# ============================================================
# Domain 2: org
# ============================================================
org:
  domain: org
  primary_owner_candidates:
    - Head of support

  entities:
    - id: org.role
      type: role
      name: Role
      description: A support function.
      attributes:
        name: string  # e.g. support agent, escalation lead
        responsibilities: list
      tags: [primary]

# ============================================================
# Template Acceptance
# ============================================================
template_acceptance:
  - Defines 2 domains (customer + org)
  - Shaped for a tickets-and-responses business rather than a generic one
  - Naming convention = lowercase + dot-separated, matching the base starter
```

- [ ] **Step 2: Create `/triage-ticket`**

Create `templates/packs/customer-support/.claude/commands/triage-ticket.md`:

```markdown
---
name: triage-ticket
description: Assess a support ticket's priority and suggest routing, grounded in the ticket's own content and any prior history with the customer — categorizes only, never resolves or closes the ticket itself
---

# /triage-ticket

Look at one support ticket and work out how urgent it actually is and who should handle it,
instead of leaving every ticket in one undifferentiated queue.

## How to proceed

1. Ask which ticket this is for, if not already given (a `customer.ticket` id from
   `definitions/ontology/`, or enough detail to identify it).
2. Gather what's actually known:
   - The ticket's own `subject`, `channel`, and any description already recorded.
   - Check `notes/clients/<slug>/` for prior history with this customer — a repeat issue or a
     customer already flagged as at-risk changes how urgent this is.
3. Assess:
   - **Priority** (`low` / `medium` / `high` / `urgent`) — base this on actual signal (data
     loss, a blocked paying customer, a security report) rather than defaulting to `medium` for
     everything.
   - **Suggested routing** — which role (`org.role`) this best fits, and why.
4. Write a short triage note: priority, routing suggestion, and the one or two facts that
   justify it.
5. Offer to save the assessment onto the ticket's own record under `definitions/ontology/` (if
   the user wants it tracked) or as a note in `notes/company/` — never overwrite the ticket's
   `status` yourself; that's the human's call.

## Notes

- This command **categorizes a ticket — it does not resolve, close, or reply to it.** Use
  `/draft-response` for the reply itself.
- If there's not enough information to assess priority confidently, say so rather than
  guessing — an honest "needs more info" beats a fabricated priority level.
```

- [ ] **Step 3: Create `/draft-response`**

Create `templates/packs/customer-support/.claude/commands/draft-response.md`:

```markdown
---
name: draft-response
description: Draft a reply to a support ticket, grounded in the ticket's own content and the customer's actual history — not a generic "thanks for reaching out" template
---

# /draft-response

Draft a reply for one specific support ticket, using what's actually known about the issue and
the customer rather than a generic template.

## How to proceed

1. Ask which ticket this is for, if not already given (a `customer.ticket` id from
   `definitions/ontology/`, or enough detail to identify it).
2. Gather what's actually known:
   - The ticket's own `subject` and any description already recorded.
   - Check `notes/clients/<slug>/` for prior conversation history — a customer who's already
     explained their setup once shouldn't be asked to repeat it.
3. Draft a reply that **references the specific issue** (what they actually reported, what
   you're proposing to do about it) rather than a generic acknowledgment. If the fix needs a
   concrete next step from the customer, say exactly what it is.
4. Keep it short and end with a clear next step (what happens next, or what you need from
   them) rather than an open-ended "let us know if you need anything else."
5. Show the draft to the user. **Never send it yourself** — this drafts the reply only; the
   user sends it through their own support tool or inbox.

## Notes

- If there's no real history to draw on yet (a brand-new ticket), say so rather than inventing
  detail that isn't there — draft a genuine first-response instead of faking familiarity.
- Don't write a customer's real name, email, or ticket contents containing PII directly into
  `definitions/` — see `.claude/rules/definitions-touch.md` for where that kind of detail
  belongs instead.
```

- [ ] **Step 4: Verify with a disposable live company creation**

```bash
npx tsx -e "
import { createCompanyFromTemplateImpl } from './lib/create-company-from-template-impl'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

async function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-check-'))
  const registryPath = path.join(tmp, 'registry.json') // disposable — never the real dataPath('companies.json')
  const rootPath = path.join(tmp, 'support')
  const bundled = path.join(process.cwd(), 'templates', 'company-starter')
  const packSource = path.join(process.cwd(), 'templates', 'packs', 'customer-support')
  const result = await createCompanyFromTemplateImpl('Test support', rootPath, bundled, packSource, registryPath)
  console.log(result.ok)
  console.log(fs.existsSync(path.join(rootPath, '.claude/commands/triage-ticket.md')))
  console.log(fs.existsSync(path.join(rootPath, '.claude/commands/draft-response.md')))
  fs.rmSync(tmp, { recursive: true, force: true })
}
run()
"
```

**Important:** pass `registryPath` explicitly (5th argument) — omitting it
defaults to the real `dataPath("companies.json")` and would register a
throwaway "Test support" company into this machine's actual company list.

Expected: three `true` lines, no errors.

- [ ] **Step 5: Run the full checks**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add templates/packs/customer-support
git commit -m "Add the Customer support starter pack"
```

---

### Task 4: Add the HR & People pack

**Files:**
- Create: `templates/packs/hr-people/definitions/ontology/company.yaml`
- Create: `templates/packs/hr-people/.claude/commands/screen-candidate.md`
- Create: `templates/packs/hr-people/.claude/commands/draft-offer.md`

**Interfaces:**
- Consumes: Task 1's `hr-people` pack entry (`dirName: "hr-people"`).
- Produces: a pack directory `createCompanyFromTemplateImpl` can copy from.

- [ ] **Step 1: Create the ontology**

Create `templates/packs/hr-people/definitions/ontology/company.yaml`:

```yaml
# HR & People starter ontology — a filled-in starting point, not a blank
# template. Replace the example values with your own; keep the shape
# (customer / org / product, lowercase + dot-separated ids) since
# templates/company-starter/scripts/verify.py's ONTOLOGY-01 check and the
# rest of this starter both assume it.

version: 1
schema_version: "2026-07-30-template"
template_origin: templates/packs/hr-people/definitions/ontology/company.yaml
status: draft

# ============================================================
# Domain 1: org
# ============================================================
org:
  domain: org
  primary_owner_candidates:
    - Head of people

  entities:
    - id: org.role
      type: role
      name: Open role
      description: A position the company is currently hiring for.
      attributes:
        name: string  # e.g. backend engineer, support agent
        team: string
        status: enum  # open / filled / on_hold
      tags: [primary]

    - id: org.candidate
      type: person
      name: Candidate
      description: Someone being considered for an open role.
      attributes:
        name: string
        role_id: string  # ref: org.role
        stage: enum  # applied / screening / interview / offer / hired / rejected
        applied_at: date
      tags: [primary]

# ============================================================
# Template Acceptance
# ============================================================
template_acceptance:
  - Defines 1 domain (org)
  - Shaped for a hiring-and-onboarding business rather than a generic one
  - Naming convention = lowercase + dot-separated, matching the base starter
```

- [ ] **Step 2: Create `/screen-candidate`**

Create `templates/packs/hr-people/.claude/commands/screen-candidate.md`:

```markdown
---
name: screen-candidate
description: Summarize a candidate against a role's requirements and draft screening questions, grounded in the actual role and application on file — never makes the accept/reject decision itself
---

# /screen-candidate

Help a hiring team prepare for a candidate conversation, using what's actually on file about
the role and the candidate rather than generic interview advice.

## How to proceed

1. Ask which candidate and role this is for, if not already given (an `org.candidate` id and
   its `role_id`, or enough detail to identify them, from `definitions/ontology/`).
2. Gather what's actually known:
   - The role's own requirements (`org.role`'s `name`, `team`) and anything recorded about it
     elsewhere (a job description in `notes/company/`, if one exists).
   - The candidate's `stage` and anything already noted about their application or a prior
     conversation.
3. Produce two things:
   - **A short fit summary**: where the candidate's background matches the role, and any real
     gaps worth probing — not a generic "strong candidate" writeup.
   - **Screening questions**: 4-6 questions targeted at this role's actual requirements and any
     gaps identified above, not a generic interview-question list.
4. Show both to the user.

## Notes

- **This command never makes the accept/reject/advance decision.** It prepares the human for
  their own conversation and judgment call — it doesn't substitute for it.
- If the role's requirements aren't recorded anywhere yet, say so and ask for them rather than
  inventing what the role probably needs.
- Don't write a candidate's personal contact details or application content directly into
  `definitions/` — see `.claude/rules/definitions-touch.md` for where that kind of detail
  belongs instead.
```

- [ ] **Step 3: Create `/draft-offer`**

Create `templates/packs/hr-people/.claude/commands/draft-offer.md`:

```markdown
---
name: draft-offer
description: Draft an offer letter grounded in the role and comp band on file — always routes through the HITL gate before anything is treated as final, since compensation and contract terms are named triggers there
---

# /draft-offer

Draft an offer letter for a specific candidate and role, using what's actually on file rather
than inventing terms.

## How to proceed

1. Ask which candidate and role this is for, if not already given (an `org.candidate` id and
   its `role_id` from `definitions/ontology/`).
2. Gather what's actually known: the role's `name`/`team`, and the compensation band or terms
   the user gives you — **never assume or invent a number that wasn't provided.**
3. Draft the offer letter: role, start date (ask if not given), compensation as provided, and
   any standard terms the user tells you to include.
4. **Compensation and contract terms are named triggers in `.claude/rules/hitl-gate.md`** — pause
   here, summarize exactly what's about to be offered and to whom, and get explicit approval
   before treating the draft as final or suggesting it be sent.
5. Show the draft to the user. **Never send it yourself** — this drafts the letter only; the
   user sends it through their own channel once approved.

## Notes

- If the comp band or terms aren't provided, ask rather than filling in a plausible-sounding
  number — a fabricated figure in a real offer letter is exactly the kind of mistake the HITL
  gate exists to catch before it goes out.
- This drafts one offer; it never updates the candidate's `stage` to `offer`/`hired` itself —
  that's the human's call once the process actually moves.
```

- [ ] **Step 4: Verify with a disposable live company creation**

```bash
npx tsx -e "
import { createCompanyFromTemplateImpl } from './lib/create-company-from-template-impl'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

async function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-check-'))
  const registryPath = path.join(tmp, 'registry.json') // disposable — never the real dataPath('companies.json')
  const rootPath = path.join(tmp, 'hr-people')
  const bundled = path.join(process.cwd(), 'templates', 'company-starter')
  const packSource = path.join(process.cwd(), 'templates', 'packs', 'hr-people')
  const result = await createCompanyFromTemplateImpl('Test hr-people', rootPath, bundled, packSource, registryPath)
  console.log(result.ok)
  console.log(fs.existsSync(path.join(rootPath, '.claude/commands/screen-candidate.md')))
  console.log(fs.existsSync(path.join(rootPath, '.claude/commands/draft-offer.md')))
  fs.rmSync(tmp, { recursive: true, force: true })
}
run()
"
```

**Important:** pass `registryPath` explicitly (5th argument) — omitting it
defaults to the real `dataPath("companies.json")` and would register a
throwaway "Test hr-people" company into this machine's actual company list.

Expected: three `true` lines, no errors.

- [ ] **Step 5: Run the full checks**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add templates/packs/hr-people
git commit -m "Add the HR & People starter pack"
```

---

### Task 5: Group the "Add a company" picker by category

**Files:**
- Modify: `components/add-company-form.tsx:122-146` (the starter-template picker block)

**Interfaces:**
- Consumes: `COMPANY_STARTER_PACKS` (now 7 entries with `category`, from
  Task 1).
- Produces: no new exports — this is a leaf UI change.

- [ ] **Step 1: Replace the flat picker grid with a category-grouped one**

In `components/add-company-form.tsx`, inside the component function, add this
just before the `if (!open) { ... }` early return (so it's computed once
per render, alongside the other `useState` calls near the top of the
function body):

```tsx
  const packsByCategory = COMPANY_STARTER_PACKS.reduce<Record<string, typeof COMPANY_STARTER_PACKS>>(
    (acc, pack) => {
      ;(acc[pack.category] ??= []).push(pack)
      return acc
    },
    {}
  )
```

Then replace the existing block:

```tsx
      {!showRestore && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Starter template <span className="text-muted-foreground/70">(only used if this path is new)</span>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {COMPANY_STARTER_PACKS.map((pack) => (
              <label
                key={pack.id}
                className={`cursor-pointer rounded-md border p-2.5 text-xs transition-colors ${
                  packId === pack.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-transparent hover:border-muted-foreground/40"
                }`}
              >
                <input
                  type="radio"
                  name="starter-pack"
                  value={pack.id}
                  checked={packId === pack.id}
                  onChange={() => setPackId(pack.id)}
                  className="sr-only"
                />
                <span className="block font-medium text-foreground">{pack.label}</span>
                <span className="mt-0.5 block text-muted-foreground">{pack.description}</span>
              </label>
            ))}
          </div>
        </div>
      )}
```

with:

```tsx
      {!showRestore && (
        <div className="space-y-2.5">
          <label className="text-xs text-muted-foreground">
            Starter template <span className="text-muted-foreground/70">(only used if this path is new)</span>
          </label>
          {Object.entries(packsByCategory).map(([category, packs]) => (
            <div key={category} className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {category}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {packs.map((pack) => (
                  <label
                    key={pack.id}
                    className={`cursor-pointer rounded-md border p-2.5 text-xs transition-colors ${
                      packId === pack.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-transparent hover:border-muted-foreground/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="starter-pack"
                      value={pack.id}
                      checked={packId === pack.id}
                      onChange={() => setPackId(pack.id)}
                      className="sr-only"
                    />
                    <span className="block font-medium text-foreground">{pack.label}</span>
                    <span className="mt-0.5 block text-muted-foreground">{pack.description}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
```

The card markup itself (`<label>`/`<input>`/two `<span>`s) is byte-identical
to before — only the wrapping changed from one flat grid to one grid per
category, each with a small uppercase heading. `packId`/`setPackId` state and
the `onChange` handler are untouched.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live-verify with Playwright against a throwaway dev server**

Per this project's standing testing convention (`CLAUDE.md` step 4), start
the dev server on a free port (not 3000 if already in use) and drive it with
Playwright:

```bash
npm run dev -- -p 3100 &
```

Then use the Playwright MCP tools to:
1. Navigate to `http://localhost:3100`.
2. Open "Add a company" (or the onboarding equivalent if the agent list is
   empty).
3. Take a snapshot/screenshot and confirm 7 category headings are visible
   (General, Engineering, Sales, Marketing, Support, HR & People,
   Leadership) each with the right pack card(s) beneath, and that clicking a
   card in a non-default category still updates the selection (check the
   `border-primary` class lands on the clicked `<label>`).
4. Stop the dev server afterward.

Expected: all 7 categories render, selection still works, no console errors.

- [ ] **Step 4: Run the full test suite and build**

Run: `npx vitest run && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/add-company-form.tsx
git commit -m "Group the starter-template picker by category"
```

---

### Task 6: Rewrite the landing page's templates section with real content

**Files:**
- Modify: `landing/templates/index.html`

**Interfaces:**
- Consumes: the pack `label`/`description`/`category` values from
  `lib/company-starter-packs.ts` (Task 1) — copy them verbatim into the HTML
  (this is a manual mirror; `landing/` has no build step, per this project's
  existing convention for keeping brand tokens in sync across app + landing).

- [ ] **Step 1: Replace the stale card grid**

In `landing/templates/index.html`, replace this block:

```html
<section class="section"><div class="wrap"><div class="grid r">
  <div class="card"><div class="dot"></div><h3>The default starter</h3><p>Somewhere to describe your business, shelves for your notes, and the core jobs ready to run on day one.</p></div>
  <div class="card"><div class="dot"></div><h3>Who, what, and for whom</h3><p>A simple map of your customers, your team and what you sell. Your AI can fill in the first draft.</p></div>
  <div class="card"><div class="dot"></div><h3>More starters <span class="soon">soon</span></h3><p>Ready-made setups shaped around the kind of business you actually run.</p></div>
  <div class="card"><div class="dot"></div><h3>Bring your own <span class="soon">soon</span></h3><p>Got a setup that works? Save it as your own starter and reuse it for the next one.</p></div>
</div></div></section>
```

with:

```html
<section class="section"><div class="wrap"><div class="grid r">
  <div class="card"><div class="dot"></div><h3>The default starter</h3><p>Somewhere to describe your business, shelves for your notes, and the core jobs ready to run on day one.</p></div>
  <div class="card"><div class="dot"></div><h3>Who, what, and for whom</h3><p>A simple map of your customers, your team and what you sell. Your AI can fill in the first draft.</p></div>
</div></div></section>
<section class="section"><div class="wrap"><div class="sec-head r"><p class="eyebrow">Ready-made packs</p><h2>Pick the shape closest to your business, then make it yours.</h2></div>
<div class="grid r">
  <div class="card"><div class="dot"></div><p class="eyebrow">Engineering</p><h3>Software engineering</h3><p>Ships an ontology for repos, features, and releases, plus a /code-review and /plan-feature command.</p></div>
  <div class="card"><div class="dot"></div><p class="eyebrow">Sales</p><h3>Sales</h3><p>Ships an ontology for leads and accounts, plus a /follow-up-lead command.</p></div>
  <div class="card"><div class="dot"></div><p class="eyebrow">Marketing</p><h3>Marketing</h3><p>Ships an ontology for campaigns and offerings, plus a /draft-campaign command.</p></div>
  <div class="card"><div class="dot"></div><p class="eyebrow">Support</p><h3>Customer support</h3><p>Ships an ontology for tickets and contacts, plus a /triage-ticket and /draft-response command.</p></div>
  <div class="card"><div class="dot"></div><p class="eyebrow">HR &amp; People</p><h3>HR &amp; People</h3><p>Ships an ontology for open roles and candidates, plus a /screen-candidate and /draft-offer command.</p></div>
  <div class="card"><div class="dot"></div><p class="eyebrow">Leadership</p><h3>Leadership team</h3><p>A generalist, cross-functional ontology (finance, ops, people) plus a /weekly-briefing command.</p></div>
</div></div></section>
<section class="section"><div class="wrap"><div class="grid r">
  <div class="card"><div class="dot"></div><h3>Bring your own <span class="soon">soon</span></h3><p>Got a setup that works? Save it as your own starter and reuse it for the next one.</p></div>
</div></div></section>
```

This reuses only existing CSS classes already defined in `landing/styles.css`
(`.card`, `.dot`, `.grid`, `.eyebrow`, `.sec-head`, `.soon`, `.wrap`, `.r`) —
the `.sec-head` + `.eyebrow` + `<h2>` pattern is the same one already used in
`landing/docs/index.html`. No new CSS is added.

- [ ] **Step 2: Live-verify headlessly**

Serve `landing/` locally and check with Playwright (matching this project's
existing precedent for landing-page verification — "verified headless
(Chromium): 0 JS errors"):

```bash
npx serve landing -l 4173 &
```

Navigate to `http://localhost:4173/templates`, take a snapshot, and confirm:
- All 7 pack names are visible in the page text (Software engineering,
  Sales, Marketing, Customer support, HR & People, Leadership team) plus
  "General purpose" is implied by "The default starter" card (already
  present, unchanged).
- No "More starters soon" text remains.
- 0 console errors, page renders correctly in both light and dark
  (`data-theme`) via the existing toggle button.

Stop the server afterward.

- [ ] **Step 3: Commit**

```bash
git add landing/templates/index.html
git commit -m "Ground the landing templates page in the 7 real starter packs"
```

---

### Task 7: Full verification sweep + changelog entry

**Files:**
- Modify: `README.md` (append changelog section)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is the closing verification + documentation
  task.

- [ ] **Step 1: Confirm no stale references to the retired pack id remain**

```bash
grep -rn "marketing-sales" --include=*.ts --include=*.tsx --include=*.html --include=*.md . | grep -v docs/superpowers
```

Expected: no output (the spec and plan documents themselves are excluded by
the `grep -v`, since they intentionally discuss the retired id historically).

- [ ] **Step 2: Run the full verification suite**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: all three clean. Note the current total test count before this
plan (365 tests, per the most recent `LAUNCH.md` session log) so you can
confirm the new `company-starter-packs.test.ts` assertion is included in the
new total.

- [ ] **Step 3: Append a changelog entry to `README.md`**

Add a new dated section after the most recent entry (currently `## v29
(2026-07-28): one design language — Alacrán across app + landing`):

```markdown
## v30: starter template expansion — 7 categorized packs + real landing copy

Expanded the starter-pack system from 4 packs to 7, organized into
categories (General / Engineering / Sales / Marketing / Support / HR &
People / Leadership) modeled on fleeceai.app/templates' category set.
`marketing-sales` was split into separate **Sales** (`/follow-up-lead`) and
**Marketing** (`/draft-campaign`) packs — their ontology and commands moved
over unchanged, just partitioned by domain (`customer` → Sales, `product` →
Marketing). Two new packs were built fresh: **Customer support**
(`customer.ticket` ontology, `/triage-ticket` + `/draft-response`) and **HR &
People** (`org.candidate` ontology, `/screen-candidate` + `/draft-offer` —
`/draft-offer` explicitly routes through `.claude/rules/hitl-gate.md` since
compensation/contract terms are named triggers there). `lib/company-starter-packs.ts`
gained a `category` field; the "Add a company" picker
(`components/add-company-form.tsx`) now groups its radio-card grid under
category headings instead of one flat list — no new page or filter UI, per
the deliberate choice to keep this app's plain-dashboard aesthetic rather
than build Fleece's full tabbed gallery. `landing/templates/index.html`,
previously stale (it said "more starters soon" while packs already
shipped), now names all 7 real packs with real descriptions, grouped the
same way. See
`docs/superpowers/specs/2026-07-30-control-panel-starter-template-expansion-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document v30: starter template expansion + landing page refresh"
```
