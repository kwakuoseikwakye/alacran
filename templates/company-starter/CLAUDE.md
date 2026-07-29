# ai-retreat-starter — operating constitution

> **This template is self-contained with plain Claude Code + GitHub.** All you need is a GitHub account,
> a plan that lets you use Claude Code, `git` and `python3`.
> MCP servers, external SDKs and additional tools are **optional**. Connect whatever you want to connect
> (freee / Notion / Slack and so on — anything that helps your own business is actively encouraged).
> That said, this template's verification (`scripts/verify.py`), hooks and retreat exercises are designed to be
> self-contained with plain Claude Code, and every feature works with no MCP connected.

This file is the operating constitution for standing up an "AI autonomous management harness" at your company.
Claude Code reads this file at the start of a session and works according to the principles and workflow written here.

---

## 0. What this template is aiming at

What do you need when you delegate work remotely to someone you've never met?
-> Clear instructions, a written procedure, and a file structure you can open without getting lost.

The same is true of an AI agent. If anything, structure matters even more, because it infers less than a human would.
This template first builds "a system humans can collaborate remotely within", then structures it into a form an AI can work in.
It consists of just 5 lightweight phases and 6 principles, and requires no special tooling.

---

## 1. The 5-phase lightweight workflow

Rather than a heavyweight workflow with elaborate phase divisions, this is condensed into **5 phases**
that can be run with plain Claude Code alone. Run this cycle for big initiatives and small fixes alike.

| Phase | Name | What you do | Main inputs/outputs |
|-------|------|---------|-----------|
| 1 | Definition | Describe your company ontology | Fill in `docs/templates/ontology-starter.yaml` into `definitions/ontology/` |
| 2 | Planning | File GitHub Issues (Issue-First, Epic -> child Issue decomposition) | GitHub Issues |
| 3 | Execution | Implement and document with Claude Code (Scope Contract discipline, Plan Mode if needed) | Code / documentation |
| 4 | Verification | Check with `scripts/verify.py` (RQT) + CI gates (no fake green) | Verification report / CI green |
| 5 | Record | Write a Decision RFC and update HANDOFF.md (session handover) | `docs/decisions/*.md`, `HANDOFF.md` |

For trivial work such as a small typo fix or a one-file config change, you may skip Phases 1-2.
For changes spanning multiple files, or work involving hard-to-reverse decisions (money, contracts,
irreversible operations), always run the whole cycle from Phase 1.

```
Phase 1 Definition -> Phase 2 Planning -> Phase 3 Execution -> Phase 4 Verification -> Phase 5 Record
     ^_______________________________________________________________________________|
              (on to the next cycle, or resume from HANDOFF)
```

---

## 2. The 6 principles

Of the thinking built up from practising the AI autonomous management harness, only what stands up without
an external SDK is kept here.

### 2.1 Issue-First

> "Everything starts with an Issue. Labels define the state."

All work starts from a GitHub Issue. Labels define the state.
For a composite task (3 or more steps), file an Epic Issue and break it into child Issues before starting.
You may omit an Issue for a simple typo or config change, but file one — even after the fact — if a record is needed.

- Include the Issue number in the branch name: `fix/123-description`
- Include an Issue reference in the commit message: `fix(scope): description (#123)`
- Write `Resolves #123` in the PR

### 2.2 HITL Gate

> Money, contracts and irreversible operations require human approval.

Hard-to-reverse operations such as sending money externally, signing a contract, deleting production data or
force pushing must not be completed by the AI alone.
See `.claude/rules/hitl-gate.md` for the trigger table and the escalation procedure.

### 2.3 SSOT (Single Source of Truth)

Put definitions in one declarative file (YAML/Markdown) and do not hand-edit the artefacts generated from them.
The ontology, KPI and cycle-plan templates under `docs/templates/` all follow this principle.
The filled-in real data goes in `definitions/`.
When you feel the urge to rewrite a generated artefact directly, fix the original definition first.

### 2.4 Scope Contract

Before starting, declare **CHANGE** (what you will change), **NOT CHANGE** (what you won't touch),
and a rough diff size, then move to Edit / Write.
Always isolate the urge to "fix this while I'm here" into a separate Issue and a separate commit.
Details in `.claude/rules/scope-contract.md`.

### 2.5 No fake-green

Don't leave verification that doesn't run, stubbed CI, or tests that only ever pass.
When `scripts/verify.py` returns a FAIL, face it rather than hiding it.
Tampering to "just make it green" is forbidden.

### 2.6 Session handover

A retreat spans multiple days and multiple sessions. At the end of a session, update `HANDOFF.md` so whoever
picks it up next (including your future self) isn't left guessing. The `/handoff` command helps with this.

---

## 3. Command list

The following are the small number of substantive commands bundled with this template.
They are not delegation stubs for external tools — they all run as-is on plain Claude Code.

| Command | Role | Corresponding phase |
|---------|------|---------------|
| `/define-company` | Define your company ontology interactively | Phase 1 |
| `/ingest-context` | Quarantine external material and take it onto the correct shelf in definitions/ (inbox mode can also promote from `notes/inbox/`) | Phase 1 |
| `/create-epic` | File an Epic Issue and break it into child Issues | Phase 2 |
| `/stock-note` | File an L2 note (company-note / market / client-note / sop) on the correct shelf with the correct frontmatter | Any time |
| `/verify` | Run `scripts/verify.py` and interpret the results | Phase 4 |
| `/handoff` | Update HANDOFF.md and take stock of unfinished tasks | Phase 5 |
| `/decision` | File a Decision RFC from the template | Phase 5 |
| `/retro` | Run a retrospective based on `retrospective-template.yaml` | Phase 5 |
| `/digest` | Aggregate frontmatter from notes/ and decisions/retros and generate an owner-facing weekly digest | Phase 5 / any time |

---

## 4. Directory structure

```
ai-retreat-starter/
├── CLAUDE.md                # this file — the operating constitution
├── README.md                # setup instructions
├── LICENSE.md                # participant-only licence
├── .claude/
│   ├── settings.json         # minimal configuration, hook wiring only
│   ├── hooks/                # git-ops-validator / format-check, etc.
│   ├── rules/                # scope-contract / issue-first / hitl-gate / definitions-touch
│   └── commands/              # the small set of commands in §3
├── definitions/               # the SSOT of your company context (where you fill things in; skeleton included)
│   ├── README.md              # how to read the whole tree, and what order to fill it in
│   ├── ontology/              # definition of the business structure (/define-company generates company.yaml)
│   ├── hitl/                  # approval trigger definitions (triggers/)
│   ├── kpi/                   # KPI measurement specifications per team/department
│   ├── cycles/                # business cycle plans
│   ├── retro/                 # the shape of retrospectives (KPT + pivot decisions)
│   └── clients/               # non-confidential structural information about clients (optional)
├── notes/                     # the L2 description layer (Obsidian-compatible; see notes/README.md)
│   └── company|market|clients|sops|inbox/  # shelves for stories, observations and procedures
├── examples/                  # filled-in samples (read-only, not subject to verify)
│   └── harukaze-ec/           # a complete set for a fictional e-commerce company
├── docs/
│   ├── directory-map.md       # the tree before and after filling in context, side by side
│   ├── starter-manual.md      # how to use the harness
│   ├── concepts/              # explanations of the design thinking (context-funnel / hitl-async-approval)
│   ├── templates/             # blank templates for ontology / KPI / cycle plans, etc. (the source you fill in from)
│   ├── decisions/             # where Decision RFCs live (generated by /decision)
│   └── retros/                # where retrospective records live (generated by /retro)
├── state/                     # git-tracked location for business cycle logs (state/cycles/<team-id>/)
├── scripts/
│   ├── verify.py               # the RQT-based verification runner
│   └── cycle/                  # business cycle operation scripts (advanced, outside the scope of the retreat exercises; see scripts/cycle/README.md)
├── exercises/                  # the 3 exercises for the day of the retreat
├── secrets/                    # always gitignored. Do not put credentials anywhere else
└── HANDOFF.md                  # session handover (updated in Phase 5)
```

---

## 4.5. Context map (information category -> where it's stored)

A mapping table so you never have to wonder "where does this information go".
When an agent needs information, it Reads the paths below directly (pull, not push).

| Information category | Where it's stored |
|-------------|--------|
| **Company ontology (definition of business structure)** | `definitions/ontology/` |
| **HITL approval trigger definitions** | `definitions/hitl/` |
| **KPI measurement specifications** | `definitions/kpi/` |
| **Business cycle plans** | `definitions/cycles/` |
| **The shape of retrospectives (KPT + pivot decisions)** | `definitions/retro/` |
| **Non-confidential structural information about clients** | `definitions/clients/<slug>/` |
| **Your company's story (history, strategy memos)** | `notes/company/` |
| **Information about other companies (competitors, market, potential partners)** | `notes/market/` |
| **Ad-hoc notes on clients (meeting notes, summaries of minutes)** | `notes/clients/<slug>/` |
| **Standard operating procedures (SOPs)** | `notes/sops/` |
| **Uncategorised raw memos (the owner's inbox)** | `notes/inbox/` (the only shelf the owner may write to directly) |
| **Confidential material (real names, real amounts, credentials, original contracts)** | `secrets/` (gitignored) |
| **Decision records (Decision RFCs)** | `docs/decisions/` (generated by `/decision`) |
| **Retrospective records** | `docs/retros/` (generated by `/retro`) |
| **Session handover** | `HANDOFF.md` (updated by `/handoff`) |
| **Filled-in complete examples** | `examples/harukaze-ec/` (read-only) |

> See `docs/directory-map.md` for how the folder structure changes before and after filling things in.

---

## 5. Session flow

### At the start

1. Read this file (CLAUDE.md) and `HANDOFF.md` to work out where things stand (the SessionStart hook auto-injects the latest section, but Read `HANDOFF.md` for the full text and past history as before)
2. Check for unfinished Issues / TODOs (`gh issue list` etc.)
3. Decide which Phase you're taking on this session

### While working

1. If there is no Issue in Phase 2, file one before starting (Issue-First)
2. Declare the Scope Contract (CHANGE / NOT CHANGE / diff budget) before Edit / Write
3. Always confirm with a human for operations that hit the HITL Gate (money, contracts, irreversible operations)
4. Run `scripts/verify.py` after a substantial change (no fake green)

### At the end

1. Do a final check with `/verify`
2. Update `HANDOFF.md` with `/handoff` (what to do next, and anything you're stuck on)
3. If you made a decision, leave a Decision RFC with `/decision`

---

## 6. Common sticking points

- **Hooks don't fire**: check the hook wiring in `.claude/settings.json` and that the hook scripts are
  executable (`chmod +x`). Hooks are built to be non-blocking with `exit 0` even when they fail, so treat
  "it doesn't work" and "it stops with an error" as separate problems. Also check that the input format the
  hook expects (stdin JSON or argv) matches the implementation (Claude Code's PostToolUse/PreToolUse hooks
  pass JSON on stdin. Written assuming argv, a hook will always grab empty input and silently do nothing —
  see Issue #26).
- **`/verify` FAILs**: follow the no-fake-green principle, read the FAIL as written and fix it.
  Editing to weaken an existing check so it passes is forbidden (no fake green). On the other hand,
  **adding** your own RQTs to `scripts/verify.py` is welcome (see `exercises/03-run-verify-loop.md`).
- **You started implementing without creating an Issue**: file the Issue even after the fact, and leave the
  reference in the commit message and PR. Issue-First ideally means "create it first", but
  "leaving a record" has the higher priority.

---

## 7. Terms of use

This template is provided exclusively to registered participants of the AI-driven management retreat.
Redistribution, commercial redistribution, and publishing derivatives in a public repository are prohibited.
See [LICENSE.md](./LICENSE.md) for details.

---

## Rule imports

@.claude/rules/scope-contract.md
@.claude/rules/issue-first.md
@.claude/rules/hitl-gate.md

---

*ai-retreat-starter — template for participants of the AI-driven management retreat*
