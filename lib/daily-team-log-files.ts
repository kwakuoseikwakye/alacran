export const DAILY_TEAM_LOG_MANIFEST: string[] = [
  "workflow/daily-team-log/gather.py",
  "workflow/daily-team-log/config.example.json",
]

export function buildDailyTeamLogSkillMd(companyName: string): string {
  return `---
name: daily-team-log
description: Generate the daily team report from this machine's Claude Code session history, in this company's daily report format. Use when asked to "write today's report", "daily report", "daily team log", or when the daily-team-log scheduled task runs unattended. On first run it bootstraps via Setup.md (auto-detects who you are + which projects, then asks). Extracts the day's sessions with gather.py (zero token cost), summarizes them into the fixed English daily-report template under reports/<person>/, commits (and pushes, if this repo has a remote).
---

# Daily Team Report (from Claude Code history)

On each person's machine, turn that day's Claude Code history into a **daily report for ${companyName}** and commit it.
Nobody shares their local context; only the **one-file-per-day report** is shared into the repo.
Runs the same way from the \`daily-team-log\` scheduled task and when invoked manually.

> Path notation: \`<workflow>\` = the folder this SKILL.md lives in (\`.claude/skills/daily-team-log/\` in this repo).
> \`<output_repo>\` = \`output_repo\` from config.json (this repo's own \`reports/\` folder). \`<person>\` = \`person\` from config.json (your name).
> The unattended routine fills these in as absolute paths; for manual runs, derive them from config.json as above.

## What's in this skill

- Script: \`<workflow>/gather.py\` (zero-token extractor)
- First-time setup: \`<workflow>/Setup.md\` (auto-detects person + projects and confirms)
- Config (per-user): \`~/.claude/daily-team-log/config.json\`
  - \`person\` - your name (= the folder under \`reports/\`)
  - \`output_repo\` - this repo's own \`reports/\` folder
  - \`projects\` - allowlist of project names you're willing to share (never include NDA work; \`["*"]\` = all)
  - \`timezone\` / \`lookback_days\` / \`bootstrapped\`

## 0. Bootstrap check (always first)

Read \`~/.claude/daily-team-log/config.json\`. If it is **missing, or \`bootstrapped\` is not \`true\`**, this machine is not set up yet:

- -> Run the \`Setup.md\` flow first (auto-detect person + projects -> confirm -> write config.json -> register routine), and **do not generate a report this run**.
- If an unattended run hits this state, reply \`"not set up - run Setup.md first"\` and stop (do not ask questions).

Once \`bootstrapped: true\` is confirmed, read \`person\` / \`output_repo\` and continue with the steps below.

## Steps

> First, sync the repo (if it has a remote): \`git -C <output_repo> pull --rebase --autostash\`. If it fails (offline or no remote), continue.

### 1. List the dates that need a report

\`\`\`
python3 <workflow>/gather.py pending
\`\`\`

If nothing prints, finish with "no reports to write". Within \`lookback_days\`, this returns dates that had Claude Code activity but have no report yet (so days the app was closed get backfilled later).

### 2. For each date, summarize into the fixed template and write it

For each date, one at a time:

\`\`\`
python3 <workflow>/gather.py digest --date <YYYY-MM-DD>
\`\`\`

Summarize the returned digest into the **fixed English template** below and write it to \`<output_repo>/<person>/<YYYY-MM-DD>.md\`.
**Keep every heading and front-matter key exactly as written.**

### 3. Commit (and push, if this repo has a remote)

\`\`\`
git -C <output_repo> add <person>/<YYYY-MM-DD>.md
git -C <output_repo> commit -m "auto(daily-log): <YYYY-MM-DD> <person>"
git -C <output_repo> pull --rebase --autostash
git -C <output_repo> push
\`\`\`

- Never \`git add -A\`. Only your own file for that day.
- If the push is rejected by a concurrent push, run \`pull --rebase --autostash\` then \`push\` one more time.
- If this repo has no remote configured, or pull/push fails (e.g. offline), keep the commit, report the error in one line, and move to the next date (don't stop).

## Output template (fixed, English)

\`\`\`markdown
---
date: <YYYY-MM-DD>
author: <person>
business: ${companyName}
status: submitted
hours:
tags: []
needs_review: false
---

# <YYYY-MM-DD> — Daily Report (<person>)

## Summary


## Done today
-

## In progress
-

## Blockers / needs decision
-

## Plan for tomorrow
-

## Claude session summary
- **Topic:**
  -

## Numbers / results
-
\`\`\`

## Summarization guidance (digest -> template mapping)

- **Write in English.** \`<person>\` is the config person; \`<YYYY-MM-DD>\` is the target day.
- **Headings and front-matter keys are fixed.** Keep every section (use \`- none\` if empty).
- Mapping:
  - **Summary** - 2-3 lines. The day's central theme and result.
  - **Done today** - what was completed (the digest's deliverables, commits, finished work).
  - **In progress** - started but unfinished; add a one-line status each.
  - **Blockers / needs decision** - where you're stuck or where a decision-maker must decide. Write \`none\` if none. **If there is a real item here, set \`needs_review: true\` in the front matter.**
  - **Plan for tomorrow** - next steps (from "next" mentions in the session, etc.).
  - **Claude session summary** - \`Topic:\` with the day's topic, then bullets of what was explored / produced.
  - **Numbers / results** - optional. Files touched, commit counts, anything quantitative. \`- none\` if nothing.
- **Summarize, don't paste.** Compress long exchanges down to meaningful outcomes.
- Never write tokens, API keys, or customer personal data. Never write confidential financial or legal data.
- Do not use an em dash; use " - ".

## Unattended-run rules

- Don't ask questions. If one date fails, continue with the rest.
- At the end, report the dates you wrote in one line.

## Known limitation

This skill's config lives at a fixed, global, per-machine path
(\`~/.claude/daily-team-log/config.json\`) — not scoped per-installation.
If this machine already has \`daily-team-log\` bootstrapped for a
different company or repo, running \`Setup.md\` here will overwrite that
shared config rather than keeping them independent. Only one
installation of this skill can be actively bootstrapped per machine at
a time.
`
}

export const DAILY_TEAM_LOG_SETUP_MD = `# Daily Team Report - First-time setup (bootstrap)

Runs **once per machine**, the first time this skill is invoked.
It auto-detects "who you are (person)" and "which projects to share (projects)", then writes config.json and registers the routine: **auto-detect -> confirm -> write config.json -> register routine**.

> When it runs: from the \`SKILL.md\` "## 0" check, when \`~/.claude/daily-team-log/config.json\` is missing or \`bootstrapped\` is not \`true\`.
> After it completes, normal daily runs skip this flow.
> Prerequisites: none beyond this repo already existing locally (it does — you're reading this from inside it).

---

## Step 0. Detect

This repo's own \`reports/\` folder is the \`output_repo\` target — nothing to clone. Detect using the gather.py in this skill folder:

\`\`\`
python3 <workflow>/gather.py detect
\`\`\`

It returns JSON. Fields you use:
- \`person_guess\` - a name guessed from git/OS (a starting point, not necessarily correct)
- \`current_project\` - the project Claude is currently launched in (the default candidate to share)
- \`config_path\` - where to write config (\`~/.claude/daily-team-log/config.json\`)
- \`candidates[]\` - every project with recorded sessions (\`project / sessions / last_active / is_current\`, newest first)
- \`kit_dir\` / \`gather_path\` / \`skill_md_path\` - absolute paths to bake into the routine prompt
- \`already_bootstrapped\` - if true, say "already set up" and stop

## Step 1. Confirm "who are you" (ask)

Show \`person_guess\`, then confirm with **AskUserQuestion**. This becomes the folder name under \`output_repo\`.

- Question: "Whose name should this machine's reports be filed under? (detected: <person_guess>)"
- Options: \`person_guess\` (if set) + Other (free text).

Use the confirmed value as \`person\`.

## Step 2. Confirm "which projects to share" (ask)

Show \`candidates\`. **For NDA safety, default to the minimum** (only the \`is_current\` project) and recommend it.

- Display each candidate as \`project (N sessions, last <last_active>)\`. Annotate \`is_current: true\` with "<- current project".
- Question: "Which projects should be included in the daily report? (do not include client-confidential / NDA work)"
- **AskUserQuestion (multiSelect: true)**. Put \`is_current\` first (recommended), plus the few most-recent candidates.
- Add a note: "to include everything, choose Other and enter \`*\`".

Use the chosen \`project\` array as \`projects\` (\`["*"]\` if \`*\`).

## Step 3. Write config.json

Write to \`config_path\` (\`~/.claude/daily-team-log/config.json\`). Create the parent folder first if needed:

\`\`\`
mkdir -p ~/.claude/daily-team-log
\`\`\`

Content:

\`\`\`json
{
  "person": "<confirmed name>",
  "projects": ["<chosen project>", "..."],
  "output_repo": "<this repo's absolute path>/reports",
  "timezone": "Asia/Tokyo",
  "lookback_days": 3,
  "bootstrapped": true
}
\`\`\`

- \`output_repo\` is this repo's own \`reports/\` folder (create it if it doesn't exist yet).
- Always include \`bootstrapped: true\` (so setup is skipped next time).

## Step 4. Create the folder and verify

\`\`\`
mkdir -p <output_repo>/<person>
python3 <workflow>/gather.py pending
\`\`\`

- If \`pending\` returns dates, it works. Run \`digest --date <date>\` for one day and eyeball that only the intended projects are included.
- If something unexpected is included, fix \`projects\`.

## Step 5. Register the routine (scheduled task) automatically

Actually **create** the scheduled task here (don't make the user touch the GUI).

**Use the LOCAL scheduled-tasks MCP tool for this: \`mcp__scheduled-tasks__create_scheduled_task\`. Do NOT use the cloud \`/schedule\` skill or \`CronCreate\` - cloud agents can't read this machine's \`~/.claude/projects\`, so the job would produce nothing. If the tool isn't loaded, find it by its exact name via tool search (\`select:mcp__scheduled-tasks__create_scheduled_task\`).**

1. Check whether \`daily-team-log\` exists with \`mcp__scheduled-tasks__list_scheduled_tasks\`:
   - If absent, \`mcp__scheduled-tasks__create_scheduled_task\`; if present, \`mcp__scheduled-tasks__update_scheduled_task\`.
2. Parameters:
   - \`taskId\`: \`daily-team-log\`
   - \`description\`: \`Generate and commit the daily team Claude Code report (<person>)\`
   - \`cronExpression\`: \`0 22 * * *\` (daily 22:00, machine local time)
   - \`prompt\`: the template below with **\`<workflow>\` / \`<person>\` / \`<output_repo>\` / \`<gather_path>\` / \`<skill_md_path>\` replaced by the confirmed values** (leave \`<DATE>\` as-is; the routine fills it per date). The routine is unattended, so use absolute paths.

### Routine prompt template (substitute and pass)

\`\`\`
You are running the daily team-alignment report job, unattended. Do not ask questions; handle errors gracefully.

0. Sync the repo first (if it has a remote):
   git -C <output_repo> pull --rebase --autostash
   If this fails (offline or no remote), continue with local state.

1. Run this exact command and read its output:
   python3 <gather_path> pending
2. If it prints nothing, reply "no reports to write" and stop.
3. Otherwise, for each printed date (YYYY-MM-DD), one at a time:
   a. Read <skill_md_path> and follow it exactly.
   b. Get that day's clean digest:
      python3 <gather_path> digest --date <DATE>
   c. Summarize the digest into the FIXED ENGLISH daily-report template defined in SKILL.md (front matter + Summary / Done today / In progress / Blockers - needs decision / Plan for tomorrow / Claude session summary / Numbers - results). Keep every heading and front-matter key EXACTLY. It must be a summary, not a paste of the raw log.
   d. Write it to: <output_repo>/<person>/<DATE>.md
   e. Commit ONLY that file:
      git -C <output_repo> add <person>/<DATE>.md
      git -C <output_repo> commit -m "auto(daily-log): <DATE> <person>"
4. Push, if this repo has a remote (retry once on race):
   git -C <output_repo> pull --rebase --autostash && git -C <output_repo> push
   If push is rejected, run that same pull --rebase + push line ONE more time.
   If there's no remote, skip this step.
5. When finished, report which dates you wrote in one line.

Rules:
- English output.
- Never use an em dash; use " - ".
- Do not write any tokens, API keys, customer personal data, or confidential financial/legal data into the report.
- If one date fails, skip it and continue. Never use git add -A.
\`\`\`

3. Once registered, tell the user: "Press **Scheduled -> daily-team-log -> Run now** once to pre-approve Bash/Read/Write so unattended runs don't pause on permissions."

---

## Completion signal

\`Setup complete: person=<name> / projects=<array> / output=<output_repo> / routine=registered (daily 22:00)\`

From then on, the routine runs the normal \`SKILL.md\` flow (pull -> pending -> digest -> summarize -> write -> commit -> push) every day. Invoking it manually does the same.
`
