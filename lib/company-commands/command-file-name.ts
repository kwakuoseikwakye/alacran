const FLAT = /\/commands\/([^/]+\.md)$/
const SHARED = /\/\.agents\/skills\/([^/]+)\/SKILL\.md$/

/**
 * The registry filename (`digest.md`) a file on disk answers to, or undefined when it is not a command.
 *
 * A command is either a flat `.claude/commands/<name>.md` or, once a company has moved its commands
 * (lib/portable-skills.ts), `.agents/skills/<name>/SKILL.md`. The workspace tree and the Run tab match
 * files to `COMPANY_COMMANDS` by this name, so recognising only the flat shape would take the Run button
 * away from every company the moment it became portable.
 */
export function commandFileNameOf(filePath: string): string | undefined {
  const p = filePath.replace(/\\/g, "/")
  const shared = SHARED.exec(p)
  return FLAT.exec(p)?.[1] ?? (shared ? `${shared[1]}.md` : undefined)
}
