import type { DailyTeamLogConfig } from "./read-config"

export function buildDailyTeamLogPrompt(config: DailyTeamLogConfig): string {
  return `You are running the daily team-alignment report job, unattended. Do not ask questions; handle errors gracefully.

0. Sync the shared repo first:
   git -C ${config.clone} pull --rebase --autostash
   If this fails (offline), continue with local state.

1. Run this exact command and read its output:
   python3 ${config.gatherPath} pending
2. If it prints nothing, reply "no reports to write" and stop.
3. Otherwise, for each printed date (YYYY-MM-DD), one at a time:
   a. Read ${config.skillMdPath} and follow it exactly.
   b. Get that day's clean digest:
      python3 ${config.gatherPath} digest --date <DATE>
   c. Summarize the digest into the FIXED ENGLISH daily-report template defined in SKILL.md (front matter + Summary / Done today / In progress / Blockers - needs decision / Plan for tomorrow / Claude session summary / Numbers - results). Keep every heading and front-matter key EXACTLY. It must be a summary, not a paste of the raw log.
   d. Write it to: ${config.outputRepo}/${config.person}/<DATE>.md
   e. Commit ONLY that file:
      git -C ${config.outputRepo} add ${config.person}/<DATE>.md
      git -C ${config.outputRepo} commit -m "auto(daily-log): <DATE> ${config.person}"
4. Push to the shared repo (retry once on race):
   git -C ${config.clone} pull --rebase --autostash && git -C ${config.clone} push
   If push is rejected, run that same pull --rebase + push line ONE more time.
5. When finished, report which dates you wrote in one line.

Rules:
- English output (repo rule).
- Never use an em dash; use " - " instead.
- Do not write any tokens, API keys, customer personal data, or confidential financial/legal data into the report.
- If one date fails, skip it and continue. Never use git add -A.`
}
