# Starter Manual — AI-driven management retreat

> Expected read time: about 15 minutes. Once you've read it, move on to
> `exercises/01-define-your-company.md`.

---

## 1. What this template is

This template is a starter kit for an AI autonomous management harness that **runs on plain
Claude Code (+ GitHub) alone**. No external SDK or dedicated fleet of MCP servers is needed —
`git clone` it and start using it from Claude Code right away.

What's included:

- A lightweight 5-phase workflow (Definition -> Planning -> Execution -> Verification -> Record)
- The 5 operating principles: Issue-First / HITL Gate / SSOT / Scope Contract / no fake green
- YAML/Markdown templates for your own company ontology, KPIs, cycles, and retrospectives
- A working verification script (`scripts/verify.py`) and the CI that runs it
- 3 hands-on exercises for the day of the retreat

What's deliberately NOT included:

- An external SDK, a dedicated fleet of agents, a dedicated MCP server
- Core management information like a pricing model or GTM design (something you design in
  your own retreat work)
- Your company's specific answers (the template is a "shape," not an "answer")

---

## 2. 15-minute setup

### 2.1 Prepare the prerequisites

```bash
git --version        # required
python3 --version    # 3.9+ recommended
claude --version      # Claude Code CLI (Pro or above, or a Claude Code-eligible plan)
```

If any of these are missing, set them up first. You'll also need a GitHub account.

### 2.2 Create your own repository

This template is distributed as a GitHub **Template Repository**. Duplicate it as **your own
private repository** via the "Use this template" button (it's a duplicate, not a fork, so its
history and network relationship are separated from this template).

```bash
git clone git@github.com:<your-account>/<your-repo-name>.git
cd <your-repo-name>
```

> ⚠️ **Always start from a private repository.** The retreat includes work that handles your
> own company's confidential information. See README.md's security-operations section for
> details.

### 2.3 Start Claude Code and have it read in

```bash
claude
```

Once it starts, first have it read `CLAUDE.md`. This is the template's "operating
constitution," and Claude Code automatically loads it at the start of a session.

### 2.4 Run the verification loop once

```bash
python3 scripts/verify.py
```

This is the RQT (Requirements Traceability) verification script. At first, almost everything
shows `INFO` (skipped because the target file doesn't exist yet) — that's normal. `PASS`
grows as you progress through the retreat. For usage details, see the docstring at the top
of `scripts/verify.py` and `.claude/rules/scope-contract.md`.

That's it — the 15-minute setup is done.

---

## 3. The 5-phase workflow (overview)

This template condenses the 8-phase workflow of the autonomous management harness it's
derived from into a **lightweight 5 phases** that run on plain Claude Code.

```
Phase 1 Definition   — write your company ontology (templates/ontology-starter.yaml)
Phase 2 Planning     — file a GitHub Issue (the Issue-First principle, Epic -> child Issue decomposition)
Phase 3 Execution    — implement/document with Claude Code (follow the Scope Contract discipline)
Phase 4 Verification — machine-verify with scripts/verify.py (RQT)
Phase 5 Record       — record the Decision + update HANDOFF (session handover)
```

The detailed procedure for each phase and how to use the templates is documented in
`CLAUDE.md`. This manual covers only the overview — the hands-on details are left to each
`exercises/*.md`.

---

## 4. Your first Issue (the Issue-First principle)

In this template, **all work starts from a GitHub Issue**. "Labels define the state" — that
is, this is designed so that what's currently in progress and what's done can be seen from
the Issue list alone, without digging through code or docs.

### Example: filing an Epic for "defining our company"

1. Check for an existing Issue: `gh issue list`
2. If nothing matches, file an Epic Issue:
   ```bash
   gh issue create --title "Epic: define our company ontology" \
     --body "Based on templates/ontology-starter.yaml, define the structure of our own
   customer, org, and product domains. Break this into child Issues as we go."
   ```
3. For a composite task, break it into child Issues (1 child Issue = 1 concern)
4. Include the Issue number in the branch name: `feature/12-define-customer-ontology`
5. Include an Issue reference in the commit message: `feat(ontology): define customer entity (#12)`
6. Once the work is done, write `Resolves #12` in the PR

The `/define-company` exercise lives at `exercises/01-define-your-company.md`. For the
retreat day's flow, including filing Issues, see `docs/retreat-day-flow.md`.

---

## 5. The HITL Gate — when a human should be the one to decide

Letting an AI agent "just automate everything" is dangerous. In particular,
**money, contracts, and irreversible operations** like the following are compiled as a
trigger table in `.claude/rules/hitl-gate.md`, marking when human approval should be
inserted.

Typical HITL trigger examples:

| Category | Example |
|---|---|
| Large amounts | Transactions/contracts above a certain amount |
| Contracts | Signing a contract, a legally binding agreement |
| Irreversible operations | Deleting production data, force push, external announcements |
| Major incidents | Responding to a service-outage-class failure |
| Hiring/firing | A final HR decision |

Deciding up front "what to delegate to the AI, and what a human holds onto" is the starting
point for the whole retreat. The exercise for actually designing one HITL trigger is
`exercises/02-first-hitl-gate.md` (added once Phase B is complete).

---

## 6. SSOT and how to navigate the directory

"There's only one truth in one place" — the SSOT (Single Source of Truth) principle. Keeping
the same information scattered across a spreadsheet, a document, and code separately makes
it unclear which is current, and confuses both the AI and humans.

```
<your-repo>/
├─ CLAUDE.md                    <- the instruction manual for Claude Code (read with top priority)
├─ README.md                    <- the repo's entry point / terms of use
├─ LICENSE.md                   <- a license limited to retreat participants
├─ .claude/
│   ├─ hooks/                   <- advisory checks, e.g. at git commit time
│   ├─ rules/                   <- operating disciplines like scope-contract / hitl-gate
│   └─ commands/                <- a curated set of commands (/define-company etc.)
├─ docs/
│   ├─ starter-manual.md        <- this file
│   ├─ concepts/                <- explanations of the design thinking (context-funnel / hitl-async-approval)
│   └─ templates/                <- the templates (ontology, KPI, cycle, retrospective) and
│                                   the path-selector / onboarding-checklist guides
├─ definitions/                 <- the SSOT of your own company's context (fill in here, copied from the templates)
├─ examples/                    <- filled-in samples (read-only)
├─ scripts/
│   ├─ cycle/                   <- business-cycle operations scripts (advanced, outside the exercises' scope)
│   └─ verify.py                <- the RQT machine-verification script
├─ state/                       <- where cycle-operations logs live (written by scripts/cycle/)
├─ .github/workflows/
│   └─ verify.yml                <- the CI gate (automatically runs verify.py)
└─ exercises/                   <- the 3 exercises for the day of the retreat
```

When adding a new definition, first copy the corresponding template under `templates/`, and
write it into one single place (YAML or Markdown). Don't scatter generated copies across
multiple places.

---

## 7. Common pitfalls

### 7.1 Accidentally committing an API key or contract into secrets/

`secrets/` is blocked by `.gitignore`, but confidential information **accidentally placed
somewhere else** isn't guarded. Make a habit of always checking the diff with `git status`
before committing. Starting from a private repository is also one layer of insurance against
this accident.

### 7.2 Mixing multiple concerns into one PR

Once "fixed this other thing while I was at it" starts piling up, review becomes difficult,
and a regression can slip in unnoticed. Run `.claude/rules/scope-contract.md`'s "5-second
check before starting" every time. Just deciding CHANGE / NOT CHANGE / diff budget before you
start prevents most scope inflation.

### 7.3 Proceeding on "I think it works" without running verify.py

Even if it looks like it's working, a change that hasn't gone through machine verification is
a breeding ground for "fake green." At every milestone, always run
`python3 scripts/verify.py` and confirm there's no FAIL before moving on. You can experience
this hands-on in `exercises/03-run-verify-loop.md`.

### 7.4 Automating without first deciding on HITL triggers

Starting from "let's just hand everything to the AI for now" leads to a scramble later, when
you realize decisions touching money or contracts had quietly been automated too. Design your
HITL triggers (§5) at the same time as your automation, without fail.

---

## 8. What to do next

Once you've finished reading this manual, move on to the next file:

👉 **`exercises/01-define-your-company.md`** — the first exercise, defining your own company
ontology.

After that comes `exercises/02-first-hitl-gate.md` (experiencing the HITL Gate), then
`exercises/03-run-verify-loop.md` (experiencing the verify loop).

After finishing each exercise, we recommend filing one Epic Issue about your own management
challenge. By the end of the retreat, your repository should have grown into "a template for
an AI-driven management harness applied to your own company."

---

*ai-retreat-starter — Starter Manual*
