# Starter template expansion + landing page — design spec

## Problem

Two gaps, one root cause:

1. **In-app**: only 4 starter packs exist (`general`, `software-engineering`,
   `marketing-sales`, `leadership-team`), shown as a flat, uncategorized
   2-column radio-card grid in the "Add a company" form
   (`components/add-company-form.tsx`). The user wants more packs, organized
   by business category — modeled on fleeceai.app/templates (category tabs:
   Sales, Marketing, Operations, Engineering, Support, HR & People — grid of
   cards underneath).
2. **Landing page**: `landing/templates/index.html` is stale and
   aspirational. It says "More starters **soon**" and doesn't name a single
   real pack, even though 3 packs already shipped 2026-07-30 (see
   `LAUNCH.md`'s session log). It undersells what the product already does.

## Scope decisions (from brainstorming)

- Add **Customer support** and **HR & People** packs (new), and **split**
  `marketing-sales` into separate **Sales** and **Marketing** packs — this
  matches Fleece's category set exactly (Engineering / Sales / Marketing /
  Support / HR & People), plus this project's existing **General** and
  **Leadership** categories.
- In-app UI: **stay with the existing simple radio-card grid**, just add
  category group headings above the cards. No new page, no tab/filter
  widget — matches this app's plain-dashboard aesthetic and the low pack
  count (7) doesn't need filtering.
- Landing page: replace the vague "soon" copy with a real, categorized grid
  naming all 7 packs and their actual one-sentence descriptions. No fake
  metrics (time-saved, integration logos, Popular/New badges) — those are
  Fleece-specific claims this product can't honestly back.

## Pack list (final state)

| id | label | category | commands | status |
|---|---|---|---|---|
| `general` | General purpose | General | (none — base only) | unchanged |
| `software-engineering` | Software engineering | Engineering | `/code-review`, `/plan-feature` | unchanged |
| `sales` | Sales | Sales | `/follow-up-lead` | **new id**, content moved from `marketing-sales` |
| `marketing` | Marketing | Marketing | `/draft-campaign` | **new id**, content moved from `marketing-sales` |
| `customer-support` | Customer support | Support | `/triage-ticket`, `/draft-response` | **new** |
| `hr-people` | HR & People | HR & People | `/screen-candidate`, `/draft-offer` | **new** |
| `leadership-team` | Leadership team | Leadership | `/weekly-briefing` | unchanged |

The `marketing-sales` id and its `templates/packs/marketing-sales/` directory
are **retired**, not kept for back-compat: `packId` is never persisted past
company creation (`lib/create-company-from-template.ts` uses it only once, to
pick a copy source), so no already-created company depends on the old id
still resolving.

## Content for the new/split packs

**Sales** (`templates/packs/sales/`) — ontology keeps the existing `customer`
domain (`customer.lead`, `customer.account`, `customer.contact`, unchanged)
plus `org.role` "Sales rep." `.claude/commands/follow-up-lead.md` moves over
verbatim (it already only references `customer.*`).

**Marketing** (`templates/packs/marketing/`) — ontology keeps the existing
`product` domain (`product.campaign`, `product.offering`, unchanged) plus
`org.role` "Campaign manager." `.claude/commands/draft-campaign.md` moves
over verbatim (already only references `product.*`).

**Customer support** (`templates/packs/customer-support/`) — new:
- Ontology: `customer.ticket` (subject, channel, priority, status:
  open/pending/resolved, opened_at) + `org.role` "Support agent."
- `/triage-ticket` — reads a ticket plus any prior notes/history, assesses
  priority and suggests routing; categorizes only, never resolves/closes the
  ticket itself.
- `/draft-response` — drafts a reply grounded in the ticket + customer
  history (same "never invent familiarity that isn't there" discipline as
  `follow-up-lead`); never sends — the human sends it.

**HR & People** (`templates/packs/hr-people/`) — new:
- Ontology: `org.candidate` (role applied, stage: applied / screening /
  interview / offer / hired / rejected) + `org.role` (open positions).
- `/screen-candidate` — summarizes a candidate against the role's
  requirements and drafts screening questions; explicitly never makes the
  accept/reject call itself.
- `/draft-offer` — drafts an offer letter grounded in the role/comp band;
  routes through `.claude/rules/hitl-gate.md` before treating anything as
  final, since compensation and contract terms are named triggers there
  (same pattern `draft-campaign.md` already uses for price changes).

All four follow the existing packs' voice: grounded-not-generic drafting,
explicit "never sends/finalizes" boundaries, notes pointing at
`hitl-gate.md`/`definitions-touch.md` where relevant.

`templates/company-starter/scripts/verify.py`'s `ONTOLOGY-01` check only requires a yaml's top level to
contain **at least one** of `customer`/`org`/`product` (confirmed by reading
the check) — splitting a pack's ontology across fewer domains than the
original combined pack is not a regression against that check.

## Code changes

1. **`lib/company-starter-packs.ts`**: add a `category: string` field to
   `CompanyStarterPack`. Replace the `marketing-sales` entry with `sales` and
   `marketing`. Add `customer-support` and `hr-people` entries. Keep
   `DEFAULT_COMPANY_STARTER_PACK_ID` = `general`.
2. **`templates/packs/`**: add `sales/`, `marketing/` (content moved from
   `marketing-sales/`, split per above), `customer-support/`, `hr-people/`
   (new content per above). Delete `marketing-sales/`.
3. **`components/add-company-form.tsx`**: group `COMPANY_STARTER_PACKS` by
   `category` (in table order above) and render a small heading per group
   above its existing radio-card row. No new component; same card markup,
   same `packId` state/handlers.
4. **`landing/templates/index.html`**: replace the 4 vague `.card` entries
   with a categorized grid naming all 7 real packs (label + description,
   mirrored from `company-starter-packs.ts` — landing is static HTML with no
   shared build step, so this is a manual mirror, same discipline
   `CLAUDE.md` already documents for brand tokens). Replace "Bring your own
   **soon**" wording so it doesn't imply the *pack count* is still "coming
   soon" (custom/bring-your-own-template genuinely isn't built, so that part
   stays honestly "soon").
5. **Tests**: `lib/company-starter-packs.test.ts`'s existing assertions
   (unique ids, exactly one no-overlay pack, distinct dir names) continue to
   pass unchanged against the new 7-pack list. Add one new assertion: every
   pack has a non-empty `category`.

## Out of scope (explicitly deferred)

- A dedicated in-app template gallery page with category filter tabs
  (Fleece's full UI) — rejected in favor of the simpler grouped-grid, per
  the brainstorming decision above.
- Fake usage metrics, integration badges, or Popular/New labels on any card.
- A "bring your own template" / custom-pack feature — still not built,
  landing copy keeps this honestly framed as future work.
- Any change to `general`, `software-engineering`, or `leadership-team`'s
  existing content.

## Definition of done

- 7 packs exist in `lib/company-starter-packs.ts`, each with a `category`.
- `templates/packs/` has one directory per non-general pack; `marketing-sales/`
  is gone.
- "Add a company"'s starter-template picker shows all 7 packs grouped under
  category headings.
- `landing/templates/index.html` names all 7 real packs with real
  descriptions, grouped by the same categories.
- `npx tsc --noEmit`, `npx vitest run`, `npm run build` all clean.
- A live-created company (in a disposable `/tmp` directory, per this
  project's standing safety rule) from each of the 2 new packs shows the
  right ontology + commands on disk.
