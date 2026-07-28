# ai-retreat-starter

> **AI-Driven Management Retreat — Starter Template for Participants**
> A scaffold for an AI autonomous-management harness that works with plain Claude Code + GitHub alone.
> MCP servers and external SDKs are **optional** — feel free to connect anything you want.

---

## ⚠️ Terms of Use (Must Read)

This template is provided **exclusively for registered participants of the AI-Driven Management Retreat, for use within their own company**.
Redistribution, commercial redistribution, and publishing derivatives in public repositories are prohibited.

Details: [LICENSE.md](./LICENSE.md)

---

## Status: Phase E Complete (In Distribution)

Phase A (skeleton) + Phase B (porting/rewriting) + Phase C (verification) + Phase D (distribution operations) + Phase E (structure visualization/generalization) complete. The following are in place:

- [x] `CLAUDE.md` — operating constitution built on plain Claude Code + context map
- [x] `.claude/hooks/` — format-check / git-ops-validator / definitions-touch-context / commit-msg-advisor / session-start-handoff
- [x] `.claude/rules/` — scope-contract / issue-first / hitl-gate / definitions-touch
- [x] `.claude/commands/` — 7 commands (`/define-company`, `/create-epic`, `/verify`, `/handoff`, `/decision`, `/retro`, `/ingest-context`)
- [x] `definitions/` — fill-in skeleton for your company's context SSOT (ontology / hitl / kpi / cycles / retro / clients)
- [x] `examples/harukaze-ec/` — completed, filled-in example of a fictional e-commerce company (read-only)
- [x] `docs/` — starter-manual / directory-map / 2 concept docs / 13 templates
- [x] `scripts/verify.py` (18 RQT checks) + `scripts/cycle/` (business-cycle operation scripts, advanced) + `state/`
- [x] `.github/workflows/verify.yml` (rqt / sanitize / secret-scan)
- [x] `exercises/` — 3 exercises for the retreat day

Phase D: participant-facing distribution operations (`docs/participant-guide.md` / `docs/retreat-day-flow.md` / `docs/feedback-collection.md`)
Phase E: definitions skeleton + filled-in example + directory-map + cycle-script generalization (complete)

---

## ⚡ Quickstart

```bash
# 1. Duplicate this template into your own private repo via "Use this template"
# 2. clone
git clone git@github.com:<your-account>/<your-repo-name>.git
cd <your-repo-name>

# 3. Check prerequisites
python3 --version   # 3.9+ recommended
git --version
gh --version        # GitHub CLI — used by /create-epic and /handoff
claude --version    # Claude Code CLI (Pro or higher, or a Claude Code-enabled plan)
gh auth status      # confirm gh is authenticated (interactive login via `gh auth login`)

# 4. Start Claude Code and let it read CLAUDE.md
claude
# > /define-company   (Phase 1: start by defining your company ontology)
```

---

## Design Philosophy (Principles This Template Inherits)

- **Issue-First** — all work starts from a GitHub Issue; labels define the state
- **HITL Gate** — money, contracts, and irreversible operations require human approval
- **SSOT** — definitions live in a single YAML; never edit generated artifacts
- **Scope Contract** — declare CHANGE / NOT CHANGE / diff budget before starting
- **No fake-green** — never leave broken verification or stub CI behind
- **Session handoff** — the HANDOFF.md pattern

Detailed design background is documented in `CLAUDE.md` and `docs/starter-manual.md` (added after Phase B completion).

---

## Security Operations

- `secrets/` is fully blocked via `.gitignore`. Never commit credentials or API keys
- Agent **reads** of `secrets/` are also blocked via `permissions.deny` (`Read(./secrets/**)`) in `.claude/settings.json` (because `.gitignore` prevents commits, not reads — Issue #44)
- GitHub **secret scanning + push protection**:
  - **Public repos**: automatically enabled for free. If you chose public at "Use this template", it's on as-is
  - **Private repos**: requires GitHub Advanced Security (paid). This template ships with a **gitleaks (free) scan** in its CI (the `secret-scan` job in `.github/workflows/verify.yml`)
- Participants should **start with a private repo** (this template is a private template — select private at "Use this template")
- **If you duplicated under an org**: the gitleaks-action used by the `secret-scan` job requires a
  `GITLEAKS_LICENSE` (free to obtain, from gitleaks.io) for repositories under an organization.
  Register it as a secret in the org's repo settings (not needed under a personal account)

---

## Phase Roadmap

| Phase | Status | Contents |
|---|---|---|
| A | ✅ Complete | Skeleton (LICENSE, .gitignore, README) + private repo setup + Template Repository ON |
| B | ✅ Complete | Porting/rewriting of KEEP/REWRITE set (37 files, ~4500 lines) |
| C | ✅ Complete | G6 fresh clone smoke test + 3 findings fixed + walkthrough docs |
| D | ✅ Complete | Participant pre-retreat guide + day-of flow + Issue templates + feedback collection |

## Documentation for Participants & Instructors

- **Participant pre-retreat guide**: [docs/participant-guide.md](docs/participant-guide.md)
- **Day-of flow (4h/8h patterns)**: [docs/retreat-day-flow.md](docs/retreat-day-flow.md)
- **Feedback collection**: [docs/feedback-collection.md](docs/feedback-collection.md)
- **15-minute setup expected behavior**: [docs/setup-walkthrough.md](docs/setup-walkthrough.md)

---

## Optional Modules

- `tools/office/` + `/office`: visualize your company's activity as a
  pixel-art office (optional module. Requires Node 20+. All template
  features work without it)

---

*ai-retreat-starter — Phase A/B/C/D complete, ready for distribution (2026-07-02)*
