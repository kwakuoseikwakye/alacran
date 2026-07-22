# AI-Native Control Panel — v3 Slice: Skill/Command Browser

## Status
Approved for implementation planning (2026-07-22).

## Problem

Skill management was the second of the user's three original goals for a
unified framework (control panel, skill management, reusable template). v1
and v2 shipped the control-panel half (status board + one trigger action).
This spec covers the first step of skill management: a read-only browser
for every skill/command that already exists across the three agents —
visibility before any editing, mirroring how v1 (read-only) preceded v2
(one careful write action).

Confirmed inventory as of this writing:
- `ai-company-starter-main`: 4 skills under `.claude/skills/*/SKILL.md`
  (`api-connect`, `piro`, `piro-run`, `ai-readiness-diagnostic`) and 10
  commands under `.claude/commands/*.md` (`create-epic`, `decision`,
  `define-company`, `digest`, `handoff`, `ingest-context`, `office`, `retro`,
  `stock-note`, `verify`).
- `plh-takeshi-agent`: 1 skill, `skills/plh-dev-team/SKILL.md`.
- `plh-ops`: 8 workflow-skills under `workflow/*/SKILL.md` (`video-studio`,
  `slide-walkthrough-video`, `skill-prospector`, `manga-studio`,
  `skill-installer`, `slide-studio`, `infographic-studio`, `daily-team-log`).

Every one of these files (skills and commands alike) uses the identical
YAML-frontmatter convention: a leading `---`/`---` block containing `name:`
and `description:` fields, then the body.

## Goals

- A new `/skills` page listing every skill/command across all three agents,
  grouped by agent.
- Each entry shows its `name`, a `kind` badge (`skill` vs `command`), and its
  `description`.
- Clicking an entry opens its full file content in a side panel — reusing
  v1's existing `getActivityDetail` Server Action unchanged, since every
  skill/command file already lives inside a configured agent root path that
  function already validates against.
- A third nav link ("Skills") alongside the existing "Agents"/"Activity".
- One malformed/unparseable file degrades to a graceful fallback (filename
  as `name`, empty `description`) — never crashes the page or drops other
  entries, matching v1's established house style.

## Non-goals

- No editing of any skill/command file. This is a read-only browser, full
  stop — no Server Action in this slice ever writes to
  `.claude/skills/`, `.claude/commands/`, `skills/`, or `workflow/`.
- No "trigger an improvement session" — deferred, since it depends on a
  separate, larger "spawn an arbitrary Claude Code session" mechanism not
  yet built (also needed for triggering `ai-company-starter-main`'s
  slash-commands, a separately-deferred item).
- No new YAML dependency. Frontmatter parsing extracts exactly two flat
  string fields (`name`, `description`) via a small, purpose-built parser —
  not a general YAML parser, consistent with v1's existing lightweight
  parsing style (e.g. the `cycle.jsonl` lenient line parser).
- No recursive scanning into a skill's own subdirectories (`scripts/`,
  `reference/`, etc.) — only the top-level `SKILL.md` (or, for commands,
  the command's own `.md` file) is treated as an entry.

## Architecture

```
lib/skills/
├── types.ts              # SkillEntry type, SkillAdapter type
├── parse-frontmatter.ts   # shared: extract {name?, description?} from file content
├── ai-company-starter-main.ts   # scans .claude/skills/*/SKILL.md + .claude/commands/*.md
├── plh-takeshi-agent.ts         # scans skills/*/SKILL.md
└── plh-ops.ts                   # scans workflow/*/SKILL.md
lib/
└── get-all-skills.ts      # merge utility, mirrors lib/get-all-activities.ts
app/skills/
└── page.tsx               # new page
components/
└── skill-browser.tsx      # client component: grouped list + detail Sheet
```

`lib/skills/types.ts`:
```
type SkillEntry = {
  id: string        // absolute file path, stable and unique
  agentId: string    // "ai-company-starter-main" | "plh-takeshi-agent" | "plh-ops"
  kind: "skill" | "command"
  name: string
  description: string
  path: string       // absolute path to the .md file, passed to getActivityDetail
}

type SkillAdapter = (agent: Agent) => Promise<SkillEntry[]>
```

`parse-frontmatter.ts` extracts the block between the first two `---` lines
and pulls `name:`/`description:` via line-based parsing (not a YAML
library) — if the frontmatter is missing or a field is absent, the adapter
falls back to the file/directory's own name and an empty description rather
than failing.

Each adapter follows the identical error-isolation shape already
established for the three `lib/adapters/*.ts` activity adapters: a missing
directory returns `[]`; one file's read failure is caught per-file and
either skipped or degraded to a fallback entry, never discarding sibling
entries.

`lib/get-all-skills.ts` mirrors `get-all-activities.ts`: a
`getAllSkills(agents, skillAdapters)` function that calls each agent's
adapter, isolates errors per-agent (same `{agent, entries, error}` shape as
`AgentResult`), and a flatten/sort helper (alphabetical by `name` — skills
have no timestamp, unlike activities).

## UI

`/skills` (Server Component page): calls `getAllSkills`, groups entries by
`agentId`, renders one section per agent with its skills/commands as cards.
Reuses `AGENTS` from `lib/config.ts` for agent display names, consistent
with the other two pages.

`SkillBrowser` (client component): renders the grouped cards; clicking one
calls the existing `getActivityDetail(entry.path)` (from v1, unmodified)
and opens the result in a `Sheet` — the same side-panel pattern already
used by `ActivityBoard`.

## Error handling

- Missing skill/command directory for an agent → that agent's section shows
  zero entries, not an error (a project legitimately having no skills yet is
  not a failure state).
- A file that exists but has no frontmatter or unparseable frontmatter →
  still produces a `SkillEntry` (name falls back to the directory/file name,
  description is `""`), never dropped and never crashes the page.
- `getActivityDetail`'s existing path-boundary check (realpath-based,
  symlink-safe, from v1) needs no changes — every skill/command path this
  slice ever passes to it is already inside a configured agent root.

## Testing

- `parse-frontmatter.test.ts`: well-formed frontmatter, missing frontmatter
  entirely, frontmatter present but missing one/both fields, frontmatter
  with extra fields (must ignore extras, only extract `name`/`description`).
- One test file per adapter (`ai-company-starter-main.test.ts`,
  `plh-takeshi-agent.test.ts`, `plh-ops.test.ts` under `lib/skills/`),
  temp-dir fixtures mirroring the pattern from v1's activity adapters:
  normal case, missing directory, one file with malformed frontmatter
  alongside a well-formed sibling (must not lose the sibling).
- `get-all-skills.test.ts`: mirrors `get-all-activities.test.ts`'s
  error-isolation and sort tests.
- Manual verification: browse `/skills` against the real `~/AI-Native/`
  directories, confirm all ~23 skills + 10 commands render across the three
  agent sections, click at least one entry per agent and confirm its real
  file content opens in the side panel.

## Open items for v4+ (explicitly deferred, not decided here)

- Editing skill/command content from the browser.
- Triggering an AI-assisted "improve this skill" session.
- Triggering `ai-company-starter-main`'s slash-commands generally (the
  larger "spawn a Claude Code session" mechanism this and that both need).
- Triggering `plh-ops`'s daily-team-log on demand.
- Reusable template mechanism for a second "AI company."
- Optional Higgsfield-generated agent avatars.
