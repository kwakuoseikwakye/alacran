# The two-tier model of human judgement

When assessing AI fit, treating "does this need human judgement?" as a binary (needed or not) is too coarse.
**There are two tiers of judgement**, and separating them makes the design of AI adoption much cleaner.

## Tier 1: Routine approval

**Definition**: a step where, on a regular cadence (monthly, weekly), a person always presses Go/No-Go.
Human judgement is mandatory for legal or organisational responsibility, but the content itself is routine.

**Examples**:
- The director signing off payroll results
- Final approval before sending a transfer file
- The submit button on an electronic filing
- Board approval of the monthly close

**AI fit**: Low (because a person must always press it)
**But what AI can do**:
- Automatically generate the "awaiting approval" notification
- Produce a summary of what changed since last month
- Surface the history of past rejections
- Flag anomalous values

-> This shortens the time a person spends approving (AI takes on "preparing the basis for the decision")

## Tier 2: Exception judgement

**Definition**: a judgement that arises conditionally, requiring legal interpretation, experience or
person-specific know-how. It happens rarely, but the judgement load is high.

**Examples**:
- Deciding how to respond to a wage garnishment notice
- The final determination of who is affected by a change in standard remuneration grade
- Deciding how to respond to a correction request from a government body
- Handling an irregular customer complaint

**AI fit**: Low (the judgement itself is human)
**But what AI can do**:
- Automatically detect candidate cases
- Search for and present similar past cases
- Show reference patterns for the decision
- Draft a proposed correction

-> This lowers the cognitive load on the person deciding (AI does the searching and remembering)

## Why split it into two tiers

### The design changes
- Tier 1 (routine approval): the right design is **having AI build the approval screen** (make the basis for the decision visible)
- Tier 2 (exception judgement): the right design is **having AI search past cases** (memory support)

The design direction differs, so lumping both under "human judgement required" leads to the wrong AI implementation.

### The effort profile differs
- Tier 1: occurs monthly, short (a few minutes to 30 minutes)
- Tier 2: occurs conditionally, medium (30 minutes to a few hours)

Effort estimates and expected savings should be separated too.

### How transferable they are differs
- Tier 1: easy to write up as a manual (anyone can approve)
- Tier 2: depends on experienced staff (a lot of tacit knowledge)

-> What should be split out as a handover / business-continuity task is the Tier 2 side.

## How to express this in the task JSON

When `requires_human_approval: true`, state the judgement tier in the `description`:

```json
{
  "id": "T10",
  "name": "[F-approval] Final sign-off by the director",
  "description": "Approval flow from owner to checker to director (routine approval)",
  "requires_human_approval": true,
  "ai_fit": "Low",
  "ai_role": "Awaiting-approval notifications and a summary of changes (final approval by a person)"
}
```

```json
{
  "id": "T04",
  "name": "[C-judgement] Exception handling (garnishment, grade change)",
  "description": "Responding to garnishment notices and determining who is affected by grade changes (exception judgement)",
  "requires_human_approval": true,
  "ai_fit": "Low",
  "ai_role": "Automatically extracting candidates and presenting past cases (the final decision is a person's)"
}
```

## Example question to ask at Step 4

> "The steps needing human judgement are becoming clear. They look like they split into two tiers:
>
> **Routine approval (a person presses it every month)**: F reconciliation -> director sign-off, G pre-send approval, E electronic filing submission
> **Exception judgement (a person decides under certain conditions)**: C garnishment handling and grade determination, E correction requests
>
> Shall we split these two tiers into separate tasks? Splitting them makes the AI fit divide cleanly (AI can generate the summary for a routine approval; exception judgement stays with a person)."

## The effect of splitting

An example of how 10 blocks (A-J) subdivide into roughly 17 tasks once the judgement tiers are separated:

| Original block | After subdividing |
|-----------|---------|
| C Calculation | C-routine / C-exception judgement |
| E Electronic filing | E-preparation / E-routine submission / E-exception corrections |
| F Reconciliation | F-checking / F-routine approval |
| G Output | G-generation / G-routine send approval / G-distribution |
| J Office running | J-operations / J'-handover and business continuity (exception judgement) |

At this granularity the roadmap can be written clearly:
- Phase 1: the parts easiest to delegate to AI (C-routine, E-preparation, F-checking, G-generation, I record-keeping)
- Phase 2: AI drafts and a person checks (A intake, D social insurance filings, E routine submission, G distribution, H customer contact)
- Phase 3: support for the parts a person decides (C-exception, E-exception, F-routine approval, G-routine send approval, J'-business continuity)
