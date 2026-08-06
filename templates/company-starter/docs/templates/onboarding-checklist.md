# Onboarding checklist (standing up a new company)

> The procedure for adopting this template at your own company. All you need is a GitHub
> account, a plan that lets you use Claude Code, `git` and `python3`. No external SDK or MCP
> server is required.

Work through each step top to bottom. If you get stuck, re-read `docs/starter-manual.md` and
`CLAUDE.md`.

---

## Step 1. Set up the repository

- [ ] Duplicate this template as your own private repository via "Use this template"
- [ ] Clone it locally (`git clone <your-repo>`)
- [ ] Confirm `python3 --version` and `git --version` both run
- [ ] `pip3 install pyyaml` (used by `scripts/verify.py`)

## Step 2. Read the operating constitution

- [ ] Read `CLAUDE.md` (the 5-phase workflow + 6 principles + context map)
- [ ] Skim the 3 major disciplines in `.claude/rules/` (`scope-contract` / `issue-first` /
      `hitl-gate`)
- [ ] Get a feel for the "before / after filling in" folder-layout difference in
      `docs/directory-map.md`

## Step 3. Look at the complete example (1 minute)

- [ ] Open `examples/harukaze-ec/` and see what a filled-in company looks like (ontology, KPI,
      cycles, retrospectives, HITL, clients)
- [ ] "Read only." Don't use it as a source to copy from — build your own company's
      definitions under `definitions/` instead

## Step 4. Define your own company's ontology (Phase 1)

- [ ] Run `/define-company` in Claude Code
- [ ] Answer the questions to generate `definitions/ontology/company.yaml`
- [ ] Add any industry-specific entities (e.g. `sku` for an EC company). See
      `docs/templates/ontology-schema-reference.md` for the notation

## Step 5. Set up the approval gate (optional but recommended)

- [ ] Add your own company-specific rows to the trigger table in `.claude/rules/hitl-gate.md`
- [ ] If you need individual triggers (e.g. purchase orders over a certain amount), copy a
      template (`large-deal.yaml` etc.) into `definitions/hitl/triggers/` and fill it in
- [ ] If there's effectively only one approver, fill in
      `definitions/hitl/approver-registry.yaml` honestly (the deputy is `vacant`. See
      `docs/concepts/hitl-async-approval.md` for the thinking)

## Step 6. Set up KPIs, cycles, and retrospectives (optional)

- [ ] Fill in `docs/templates/kpi-measurement-template.yaml` as
      `definitions/kpi/<team>-kpi.yaml`
- [ ] Fill in `docs/templates/cycle-plan-template.yaml` as
      `definitions/cycles/<team>-cycle-plan.yaml`
- [ ] Fill in `docs/templates/retrospective-template.yaml` as
      `definitions/retro/<team>-retrospective.yaml`
- [ ] Make the target team explicit via `team_id`, and fill in every `<<TODO_*>>`

## Step 7. Verify (Phase 4)

- [ ] Run `python3 scripts/verify.py` (or `/verify`)
- [ ] If there's a FAIL, read what it says and fix it (no fake green — don't weaken the check
      itself)
- [ ] It's normal for an unfilled shelf to show up as INFO/SKIP (the design assumes you grow
      this incrementally)

## Step 9. Leave a handover (Phase 5)

- [ ] Update `HANDOFF.md` with `/handoff` (what you did this time, what's next)
- [ ] If you made a decision, leave a Decision RFC with `/decision`

---

## Related

- `docs/starter-manual.md` — a beginner's guide starting from a 15-minute setup
- `docs/templates/README-template.md` — the list of bundled templates and their roles
- `.claude/commands/ingest-context.md` — `/ingest-context`, for safely bringing in external material
