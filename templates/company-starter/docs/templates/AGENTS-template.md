---
date: 2026-07-03
type: agents-template
---

# AGENTS Template — Agent system design guidelines

> **[This file is optional / for reference.]** The 5-phase workflow (Phase 1–5) works
> completely on its own, using nothing but plain Claude Code's subagent mechanism and the
> commands in `.claude/commands/`. This file is design guidance for "once you've adopted this
> at your own company and want to build out your own agent-role system" — it is not a
> prerequisite for using the template.
> `docs/templates/README-template.md` §2 likewise classifies `AGENTS-template.md` as
> "not needed (reference only)".

> The **design principles + role taxonomy + skeleton** for standing up an autonomous agent
> system at any company.
> This file is the "template side": it defines the abstract principles and naming
> conventions. The implementation side (the actual list of agents) belongs in each company's
> own repo-root `AGENTS.md`.

---

## 1. What an agent system is

A mechanism where multiple specialized agents split up roles to accomplish one goal (a task /
cycle / mission). This template uses Claude Code's standard subagent (Task/Agent) mechanism,
with participants defining whatever agents they need themselves. It assumes no external SDK
or framework.

---

## 2. Design principles

| # | Principle | Description |
|---|------|------|
| P1 | **Single responsibility** | 1 agent = 1 responsibility. Don't double up multiple roles (e.g. codegen and review are separate agents) |
| P2 | **Read-only by default** | Exploration/analysis agents (Explore / Plan etc.) hold no Edit/Write access and return only an investigation report |
| P3 | **Structured report output** | A subagent's output — its final text — is the return value to the caller. Return the key points in structured form |
| P4 | **Explicit HITL escalation boundary** | Each agent declares which judgement calls it escalates to a human on (`definitions/hitl/`) |
| P5 | **Pull model** | Don't push context onto an agent — the agent Reads it itself when needed (the librarian model, `docs/concepts/context-funnel.md`) |
| P6 | **Branch isolation** | Dispatching a subagent must not pollute the main thread's git context |
| P7 | **Scope contract compliance** | State CHANGE / NOT CHANGE / DIFF BUDGET before starting (`.claude/rules/scope-contract.md`) |

---

## 3. Role taxonomy (6 categories)

Classify agents by function into 6 categories. Every new agent must belong to one of them.

### 3.1 Orchestrator
Handles task decomposition and dispatch. Does not implement. e.g. `coordinator` / `*-controller`.

### 3.2 Implementer
Produces real code / real SSOT. e.g. `codegen` / `frontend` / `backend` / `database`.

### 3.3 Reviewer / QA
Verifies another agent's or a human's output. Does not produce. e.g. `review` / `test` /
`security-agent`.

### 3.4 Domain Specialist
Specialized in a particular tool / platform / industry. e.g. `aws-agent` (AWS) / `chat-*`
(chat integrations) / `jj-*` (VCS). Gets a domain prefix.

### 3.5 Guard / Gate
Intervenes at decision boundaries, controlling external connections and destructive
operations. e.g. `hitl` (awaiting human approval) / `intent-guard` (deviation detection).

### 3.6 Curator
Organizes information, knowledge, or workspaces. e.g. `learning-curator` (organizing
knowledge) / `janitor` (cleaning up stale artefacts). The librarian of the Context Funnel
(`docs/concepts/context-funnel.md`) falls in this category.

---

## 4. Recommended minimal set of subagents

The starting point when building out a new agent system. Start with a small set and add as
needed.

| Operating model | Minimal set | Candidates to add |
|-----------|----------|----------|
| Dedicated (contracted / advisory) | `coordinator` / `codegen` / `review` | `+ issue` / `+ pr` (when automating filing/PRs) |
| Product-oriented | `coordinator` / `codegen` / `review` / `frontend` / `backend` | `+ qa` / `+ design-reviewer` |
| Hybrid | The union of the above, deduplicated | Add incrementally |

Guard / Curator are dispatched by the Orchestrator (`coordinator`) as needed. See
`docs/templates/path-selector.md` for how to choose an operating model.

---

## 5. Agent entry skeleton

The minimal template for 1 entry in each company's `AGENTS.md`:

```markdown
### {agent-name}

| Attribute | Value |
|------|------|
| Category | Orchestrator / Implementer / Reviewer-QA / Domain-Specialist / Guard-Gate / Curator |
| Role | (a one-sentence summary) |
| Tools used | (Read / Edit / Write / Bash / Agent, etc.) |
| HITL trigger | (the judgement conditions under which this agent escalates to a human. Corresponds to definitions/hitl/) |
| Naming convention | kebab-case (e.g. `code-gen-agent`) |
```

### Sample entry

```markdown
### codegen

| Attribute | Value |
|------|------|
| Category | Implementer |
| Role | Code generation and editing |
| Tools used | Read / Edit / Write / Bash |
| HITL trigger | Route to the approval gate on detecting a destructive migration / schema change |
| Naming convention | kebab-case (codegen) |
```

---

## 6. Naming conventions

| Convention | Details |
|------|------|
| **Recommended**: kebab-case | New agents follow the `code-gen-agent` / `review-agent` form |
| Prefix | Domain specialists get a domain prefix: `aws-*`, `db-*`, `jj-*` |
| Suffix | `-guard` for a guard, `-orchestrator` for an orchestrator, `-controller` for a controller |
| No duplicates | Don't define two agents with the same responsibility under different names (consolidate into one) |
| Nickname in your own language | Optional (not required) |

---

## 7. The relationship between the template side and the implementation side

| Category | Location | Content |
|------|------|------|
| **Template side** (this file) | `docs/templates/AGENTS-template.md` | Abstract principles, taxonomy, naming conventions, skeleton |
| **Implementation side** (each company's root) | `<repo-root>/AGENTS.md` | The actual list of agents (built by hand, following this template) |

When adopting this at a new company:
1. Read this template and understand the design principles
2. Create a new `AGENTS.md` at the repo root (start empty, add incrementally)
3. Fill in the §5 skeleton for each agent you add
4. Always place it in one of the role categories (§3)

---

## 8. Related

- `docs/templates/README-template.md` (the guide to the bundled templates)
- `docs/templates/onboarding-checklist.md` (the new-company setup procedure)
- `docs/templates/path-selector.md` (the operating-model selection guide)
- `docs/concepts/context-funnel.md` (the librarian model / pull model)

---

*AGENTS Template*
