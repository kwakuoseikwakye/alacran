# Reading ai-retreat-starter through the "AI company" lens — an explainer for non-engineers

> A document for anyone who's read "Building an AI Company with Claude Code — the concepts
> edition" (the retreat's pre-reading material), letting you see at a glance **which file in
> this template corresponds to which idea from the concepts edition**.
> Written so it's readable even if you're not an engineer — explained through "what the
> folders mean," not through code.

---

## 0. Assumed background

This assumes you've at least skimmed the concepts edition's lessons (L1-L9). This document
still works if you haven't, but "why this structure" will land less. In particular,
**L2 (context design)** is this template's backbone.

### The concepts edition, one line each (recap)

| L | One line |
|---|---|
| L1 | Claude Code is an AI that "acts," not one that just "answers" |
| L2 | **Don't spread everything out on the desk. Put it in a drawer, and only open it when needed** |
| L3 | There are 4 ways to connect to an external app (CLI / API / MCP / browser operation) |
| L4 | A skill = 1 folder. Its contents are `SKILL.md`. Call it and it behaves the same every time |
| L5 | The AI handles the thinking, a script handles the arithmetic |
| L6 | Conversations are disposable, rules go on the map |
| L7 | A role agent = a department. It works at a different desk and only reports back a summary |
| L8 | Tokens are labor cost |
| L9 | The tools are all here. The only thing left to fight over is putting context in |

---

## 1. The full map — correspondence between the concepts edition and this template

| Concepts edition | This template's actual counterpart | Location |
|---|---|---|
| The company's map (the core) | `CLAUDE.md` | repo root |
| A drawer (per-area rules) | `.claude/rules/*.md` | 3 files (issue-first / scope-contract / hitl-gate) |
| A drawer (per-area documents) | `docs/*.md` | starter-manual / participant-guide / retreat-day-flow etc. |
| A template (the shape of a folder layout) | `docs/templates/*.yaml` | ontology-starter / kpi / cycle-plan / retrospective |
| The company's real data | `definitions/*` | ontology / hitl-triggers (filled in via `/define-company`) |
| The skill equivalent (a callable procedure) | `.claude/commands/*.md` | 6 files (define-company / create-epic / verify / handoff / decision / retro) |
| A script (deterministic processing) | `scripts/verify.py`, `scripts/cycle/` | verification and cycle operations |
| Session handover | `HANDOFF.md`, `docs/decisions/` | Phase 5's record |
| Exercises (what you do on retreat day) | `exercises/*.md` | 3 files |
| Where confidential data lives (a box that must never leave) | `secrets/` | gitignored |

**This template goes as far as building out what the concepts edition calls "the map + the
drawers + the templates."** L7's subagents (role agents) aren't bundled. The design is to
first get the map and drawers in order, and add agents once you actually need them.

---

## 2. Through the L1 lens: assumes a "working" AI

The point of L1 in the concepts edition was "Claude Code isn't a chat — it's an AI that
operates real files and real tools." This template is built on that assumption.

- It doesn't just read `CLAUDE.md` — it calls `.claude/commands/`, runs
  `scripts/verify.py`, and touches `git`.
- By default, **everything runs inside your own PC** (no data goes to the cloud on its own).
- External integrations only happen "when you wire them up yourself." This template doesn't
  include any external integration (more on this at L3 below).

Because of this, the content of this template isn't "chat text that instructs the AI" — it's
positioned as **a map, drawers, and templates for the AI to read and act on**.

---

## 3. [Key point] Through the L2 lens: context design — staged disclosure

> The concepts edition's L2, in one line: **"Don't spread everything out on the desk. Put it
> in a drawer, and only open it when needed."**

This template's design commits fully to this. Let's walk through it in order.

### 3.1 The core = `CLAUDE.md` (the company's map)

The **one sheet always loaded** at session start. It doesn't write down "everything." What's
written there is:

- The **operating constitution** of the company (the organization using this template) — the
  5 phases / 6 principles
- **A map** of what's where (the "4. Directory structure" section)
- The **protocol** for what to do at session start, during work, and at session end

If you find yourself wanting to add detail here, the rule is to **escape it into a drawer (a
separate file)**. `CLAUDE.md` is "the memo always kept open on the desk," so the thicker it
gets, the more it dilutes your focus while working.

### 3.2 The drawers = `.claude/rules/*.md` (per-area rules)

This template has 3 rule files.

| File | What's written | When it applies |
|---|---|---|
| `.claude/rules/issue-first.md` | Filing Issues, branch naming, commit conventions | Before starting implementation work |
| `.claude/rules/scope-contract.md` | The discipline of declaring "what you're changing and what you're not touching" before editing | Before Editing / Writing |
| `.claude/rules/hitl-gate.md` | Money, contracts, and irreversible operations require human approval | Before a hard-to-reverse decision involving money, contracts, deletion, etc. |

These correspond to what the concepts edition calls "a drawer." Each one stands alone, and
you only need to open it for the work it's relevant to.

### 3.3 How to open a drawer — "always expanded" vs "only when needed"

The concepts edition's L2 explained there are 2 ways to open a drawer.

| Method | Explanation in the concepts edition | How this template uses it |
|---|---|---|
| **`@ import` (always expanded)** | Opened all together at the start | The 3 files (issue-first / scope-contract / hitl-gate) that `CLAUDE.md` does `@import .claude/rules/*.md` on, at its end |
| **`paths:` targeting (only when needed)** | Only opened when touching the target file | `.claude/rules/definitions-touch.md` — the SSOT-handling rule that fires when you Read `definitions/**` (the gap for a brand-new Write is filled in by a hook) |

**Why are these 3 rules "always expanded"?**

- Issue-First / Scope Contract / HITL Gate are disciplines you want in effect from the very
  first moment of every session.
- Even combined, all 3 are light (a few hundred lines), so keeping them always open doesn't
  crowd out context.
- Conversely, templates under `docs/templates/` (ontology, etc.) only need opening **when
  needed**, so instead of embedding them in `CLAUDE.md`, they're kept separate in the
  `docs/templates/` folder.

**We bundle exactly one real example of `paths:`.** `.claude/rules/definitions-touch.md` is
loaded into Claude Code when you Read anything under `definitions/**` (your own company's
real data). (Edit is covered indirectly via the Read that precedes it. The gap for a new
Write is filled in by `.claude/hooks/definitions-touch-context.sh`.) It's not `@import`ed
from `CLAUDE.md` — firing automatically on a path match is the whole point. For work that
never touches the ontology, **its mere existence costs no context at all** — this is a
worked example of the concepts edition's L2.

**What to do in the future (i.e. what you customize per company).**

- Once rules grow to 10, 20 files, split them by business area (sales / finance / labor /
  customer support, etc.) into folders, like `.claude/rules/sales/*.md`.
- On top of that, following the same pattern as `definitions-touch.md`, narrow the condition
  for opening with `paths:`, e.g. "only open sales rules when touching a sales-related file."
- This way, even as you grow this template into an "AI company," context doesn't get
  diluted.

### 3.4 The folder layout itself is the template

The concepts edition's L2 stated flatly: "folder layout = template." The idea is to map the
company's real substance (the legal entity, people, business processes) directly onto
folders.

This template's folder layout is that idea **pre-wired as a generic template**. The places
you actually put your own company's content are:

```
definitions/                    <- where your company's real data goes
├── ontology/                   <- the declarative definition of the business structure (customer, org, product)
│   └── company.yaml            <- generated by the /define-company command
└── hitl-triggers/              <- your own company's definitions of "operations needing human approval"
```

And `docs/templates/` holds "templates for how to fill it in."

```
docs/templates/
├── ontology-starter.yaml       <- the starting point for writing the business structure
├── kpi-measurement-template.yaml
├── cycle-plan-template.yaml    <- a template for planning a 3-month cycle
├── retrospective-template.yaml <- a retrospective template
├── AGENTS-template.md          <- a template for adding role agents (L7) later
├── README-template.md
└── path-selector.md
```

**This folder split itself is L2's implementation.**

- On "the desk" (`CLAUDE.md`), **only the map goes there**.
- In "the drawer" (`.claude/rules/`), **only discipline goes there**.
- In "the safe" (`definitions/`), **your company's real data goes there**.
- In "the toolbox" (`docs/templates/`), **templates go there**.
- In "the secret box" (`secrets/`), **credentials go there (never let them out)**.

### 3.5 The "first move" for non-engineers

Being told to "put context in" often leaves you stuck on where to start. Here's the order:

1. **Don't touch `CLAUDE.md`** (the operating constitution — just read it first)
2. **Run the `/define-company` command in Claude Code**
   -> Just by answering 4 questions, `definitions/ontology/company.yaml` is auto-generated.
3. **Look over the generated `company.yaml`, and fix by hand anything that feels off**
4. From the next cycle on, Claude Code reads `company.yaml` and acts accordingly

This is "the first 30 minutes of teaching the AI about your company."

---

## 4. Through the L3 lens: how to connect to external apps

The concepts edition's L3 introduced 4 ways to connect (CLI / API / MCP / browser
operation).

**This template deliberately does not include any external integration.**

As stated right at the top of `CLAUDE.md`, all you need is **a GitHub account / Claude Code /
git / python3**. There are 2 reasons:

- We want day one of the retreat spent entirely on "getting past the concepts and putting
  your own company's context in," without distraction.
- External integrations (Gmail / calendar / Slack, etc.) vary too much company to company to
  be pinned down on the template side.

So in this template, external integration is "not in the distributed package — something you
add later yourself." When you do add one, following the concepts edition's L3 order (CLI ->
MCP -> API -> browser operation) keeps you from getting stuck.

---

## 5. Through the L4 lens: skills and commands

The concepts edition's L4 explained "a skill = 1 folder + `SKILL.md`." This template
**doesn't bundle any skills**, but it does include 6 **commands** that play a similar role.

```
.claude/commands/
├── define-company.md   <- Phase 1: define your own company
├── create-epic.md      <- Phase 2: file an Epic Issue + child Issues
├── verify.md           <- Phase 4: run verify.py and interpret the results
├── handoff.md          <- Phase 5: update HANDOFF.md
├── decision.md         <- Phase 5: file a Decision RFC
└── retro.md            <- Phase 5: retrospective
```

### The difference between a skill and a command (a very short summary)

| | Skill | Command |
|---|---|---|
| How it fires | Automatically via a semantic match on `description`, or `/name` | Always manually, via `/name` |
| Where it lives | `.claude/skills/` or `~/.claude/skills/` | `.claude/commands/` |
| Contents | Frontmatter + procedure + scripts, etc. | Frontmatter + procedure |

Since this template is "the minimal setup that can run the 5 phases," it doesn't include any
semantically-firing skills — it only wires up commands called explicitly with `/name`.

**What to do in the future.** Once you notice **the same procedure being done several times**
— "summarize email every morning," "aggregate KPIs weekly" — that's **the moment to turn it
into a skill**. Sticking to the concepts edition's L4 rule of thumb — "once you've done the
same thing a few times" — prevents skill explosion (a count that grows but never gets used).

---

## 6. Through the L5 lens: scripts

The point of the concepts edition's L5 was "the AI handles the thinking, a script handles the
arithmetic."

This template's scripts are:

```
scripts/
├── verify.py       <- the verification runner that mechanically runs RQTs (Required-Quality-Tests)
└── cycle/          <- helper scripts for business-cycle operations (advanced, outside the retreat exercises' scope)
```

### Why `verify.py` is a script

Checks like "is the ontology filled in" or "is the HITL trigger table non-empty" are places
**where the judgment must never waver**. Having the AI decide it every time lets the answer
drift. Written as a script, **the same input always gives the same result** (deterministic).

This is the implementation of the concepts edition's L5: "what changes goes to the AI, what
doesn't goes to a script."

When you call `/verify` in Phase 4 (Verification), `scripts/verify.py` runs internally, and
the AI interprets the result and reports it to you.

---

## 7. Through the L6 lens: how to treat sessions

The concepts edition's L6 taught "conversations are disposable, rules go on the map." This
template is built on that premise.

| L6's teaching | This template's implementation |
|---|---|
| Write important rules into `CLAUDE.md`, not into the conversation | The 6 principles, 5 phases, and directory structure are fixed in `CLAUDE.md` |
| At the end, ask it to "leave a handover" | The `/handoff` command updates `HANDOFF.md` |
| Record decisions so they don't vanish on the spot | The `/decision` command files `docs/decisions/*.md` |
| Do a retrospective | The `/retro` command runs through `retrospective-template.yaml` |

**Commands to run once a session gets long.**

- `/handoff` — take stock so the next session isn't left guessing
- `/decision` — leave a decision as a Decision RFC

As long as you keep running these, the next session isn't left in trouble even if the
conversation cuts off partway.

---

## 8. Through the L7 lens: subagents (role agents)

The concepts edition's L7 is an area this template **deliberately doesn't implement**.

- The idea of "a company = a collection of role agents" (CEO / CFO / CSO / CHRO...) is
  powerful, but adding more agents before the map and drawers are in order causes
  **overlapping roles and confusion**.
- This template prioritizes first getting `CLAUDE.md` (the map), `.claude/rules/` (the
  drawers), and `definitions/` (real data) in order.

**The extension point for adding role agents in the future.**

- `docs/templates/AGENTS-template.md` has a template for an agent-definition file.
- The idea is to add a `.claude/agents/<name>.md` for each of your own company's roles, like
  "sales-rep agent" or "accounting agent."
- L7's key point is that "a subagent doesn't eat into the main working memory." Design it so
  **it works at a different desk and only reports back a summary**.

---

## 9. Through the L8 lens: cost

The concepts edition's L8 was "tokens are labor cost."

Looking at this template from a cost-design angle, the following measures are baked in:

- **Keeping `CLAUDE.md` thin** (the flip side of the concepts edition's L2 design). A long
  map keeps eating tokens every single session.
- **Keeping the drawers (rules) to a bare minimum (3)**. If you want to grow to 10 or 20,
  narrow the condition for opening with `paths:` (see §3.3).
- **Escaping judgment-free processing into a script (`scripts/verify.py`)** (L5's
  implementation). Not having the AI do it = no tokens needed.
- **Add subagents (L7) only once you actually need them.** Adding departments while the map
  is still thin makes each department separately load its own `CLAUDE.md`, spiking cost.

To achieve the concepts edition's L8 goal of "running 1,000 people's worth of work with 10
people," the first move is to **keep the map thin and the drawers organized**.

---

## 10. Through the L9 lens: the big picture — the 4 stages vs. this template's 5-Phase

The concepts edition's L9 said an AI company grows through **4 stages**.

| The concepts edition's 4 stages | This template's current position |
|---|---|
| ① AI secretary (each person has their own personal AI) | The stage of an individual using Claude Code |
| ② AI staff (AI staff members holding a role) | **This template is preparation to enter this stage** |
| ③ AI company (a person oversees a group of AI staff) | Beyond adding role agents (L7) |
| ④ AI-native (most decisions automated, humans focus on being "the face") | Further beyond that |

Meanwhile, this template's **5-Phase** (Definition -> Planning -> Execution -> Verification ->
Record) is a **cycle** you run regardless of which of the 4 stages above you're at. Don't
confuse the stage with the cycle.

- **Stage (① -> ④)**: the span over which the company grows. A matter of years.
- **5-Phase**: the cycle that completes 1 initiative/1 task. A matter of hours to days.

This template is a distributed state of **the map, drawers, and templates for building "②
AI staff."** From here, the intended growth path is:

1. Define your own company with `/define-company` (Phase 1)
2. File your first Epic with `/create-epic` (Phase 2)
3. Implement/document with Claude Code (Phase 3)
4. Verify with `/verify` (Phase 4)
5. Record with `/handoff` + `/decision` (Phase 5)
6. Once you've run the cycle about 3 times and gotten a feel for the shape, use
   `docs/templates/AGENTS-template.md` to add just one first role agent (a step toward ③ AI
   company)

---

## 11. Summary — this template's place in the picture

- This template is **a distributed package that translates the "tool names" learned in the
  concepts edition into actual folders and files**.
- **The implementation of L2 (context design) is this template's backbone.** Map =
  `CLAUDE.md` / drawers = `.claude/rules/` / templates = `docs/templates/` / real data =
  `definitions/`.
- External integration (L3) and subagents (L7) are **deliberately not bundled**. Getting the
  map and drawers in order comes first.
- **The one thing a non-engineer does first**: run `/define-company` in Claude Code and
  answer the questions.
- Once you've run the 5 phases about 3 times and gotten a feel for the shape, move to the
  next step (external integration / role agents).

> **The concepts edition's one-liner (L9)**:
> "The tools are all here. The only thing left to fight over is putting context in."
>
> This template turns that "place to put it in" into **a form you can start writing into
> today**.

---

## 12. Further reading

- [README.md](../README.md) — setup instructions
- [CLAUDE.md](../CLAUDE.md) — the operating constitution (this template's backbone)
- [docs/starter-manual.md](./starter-manual.md) — how to use the harness
- [docs/participant-guide.md](./participant-guide.md) — guidance for retreat participants
- [docs/retreat-day-flow.md](./retreat-day-flow.md) — the retreat day's flow
- [exercises/](../exercises/) — the 3 exercises for the day of the retreat

---

*ai-retreat-starter — an "AI company" lens explainer (for non-engineers)*
