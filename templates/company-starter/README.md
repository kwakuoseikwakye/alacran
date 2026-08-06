# company-starter

> **The default starter template for a new Alacrán company.**
> A scaffold for running a business alongside an AI agent, built to work with
> plain Claude Code + GitHub alone.
> MCP servers and external SDKs are **optional** — connect anything you want.

This is the template [Alacrán](https://github.com/kwakuoseikwakye/alacran)
scaffolds when you create a new company. If you're reading this inside a
company Alacrán just created for you, everything below already applies to
your repo.

---

## License

MIT — see [LICENSE.md](./LICENSE.md). The template itself (commands, rules,
hooks, scripts, docs) is MIT-licensed and freely reusable, redistributable,
and modifiable. That says nothing about what you put in `definitions/`,
`notes/`, `docs/decisions/`, `docs/retros/`, or `secrets/` once this becomes
your own company's repository — that's your own business data.

---

## What's included

- `CLAUDE.md` — the operating constitution: a 5-phase workflow (Definition →
  Planning → Execution → Verification → Record) and 6 principles (Issue-First,
  HITL Gate, SSOT, Scope Contract, No fake-green, Session handoff)
- `.claude/hooks/` — format-check / git-ops-validator / definitions-touch-context
  / commit-msg-advisor / session-start-handoff
- `.claude/rules/` — scope-contract / issue-first / hitl-gate / definitions-touch
  / notes-touch
- `.claude/commands/` — `/define-company`, `/create-epic`, `/verify`,
  `/handoff`, `/decision`, `/retro`, `/digest`, `/stock-note`,
  `/ingest-context`, and (once a real integration is connected)
  `/check-inbox`, `/triage-email`, `/triage-issue`
- `.claude/skills/` — `api-connect` (connecting an external service's API/CLI)
  and `ai-readiness-diagnostic`
- `definitions/` — the fill-in skeleton for your company's context SSOT
  (ontology / hitl / kpi / cycles / retro / clients / triage)
- `docs/` — a starter manual, a directory map, concept docs, and the blank
  templates everything in `definitions/` is filled in from
- `scripts/verify.py` — the RQT-based verification runner (`/verify`), plus
  `scripts/cycle/` (business-cycle operation scripts, advanced) and `state/`
- `.github/workflows/verify.yml` — RQT / sanitize / secret-scan CI

## Quickstart

If you created this company through Alacrán, it's already a local git repo
with all of this in place — open it with `claude` and start with
`/define-company`, or use Alacrán's guided setup wizard instead of the
terminal.

If you're using this template directly (outside Alacrán):

```bash
git clone <your-repo-url>
cd <your-repo-name>

# Check prerequisites
python3 --version   # 3.9+ recommended
git --version
gh --version         # GitHub CLI — used by /create-epic and /handoff
claude --version     # Claude Code CLI (Pro or higher, or a Claude Code-enabled plan)
gh auth status       # confirm gh is authenticated (interactive login via `gh auth login`)

claude
# > /define-company   (Phase 1: start by defining your company ontology)
```

---

## Design Philosophy (Principles This Template Follows)

- **Issue-First** — all work starts from a GitHub Issue; labels define the state
- **HITL Gate** — money, contracts, and irreversible operations require human approval
- **SSOT** — definitions live in a single YAML; never edit generated artifacts
- **Scope Contract** — declare CHANGE / NOT CHANGE / diff budget before starting
- **No fake-green** — never leave broken verification or stub CI behind
- **Session handoff** — the HANDOFF.md pattern

Detailed design background is documented in `CLAUDE.md` and `docs/starter-manual.md`.

---

## Security Operations

- `secrets/` is fully blocked via `.gitignore`. Never commit credentials or API keys.
- Agent **reads** of `secrets/` are also blocked via `permissions.deny`
  (`Read(./secrets/**)`) in `.claude/settings.json` — `.gitignore` only
  prevents commits, not reads.
- GitHub **secret scanning + push protection**:
  - **Public repos**: automatically enabled for free.
  - **Private repos**: requires GitHub Advanced Security (paid). This template
    ships a **gitleaks (free) scan** in its CI instead (the `secret-scan` job
    in `.github/workflows/verify.yml`).
- **Start with a private repo.** A company's own `definitions/`/`notes/`/`docs/decisions/`
  carry real business context — a public default would be a privacy incident,
  not a preference.
- **If this repo lives under a GitHub organization**: the gitleaks action used
  by the `secret-scan` job requires a `GITLEAKS_LICENSE` (free, from
  gitleaks.io) for org-owned repos. Register it as a secret in the org's repo
  settings (not needed under a personal account).
