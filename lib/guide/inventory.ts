import fs from "node:fs/promises"
import type { Dirent } from "node:fs"
import path from "node:path"
import { getCompanyDepartmentsDetailed } from "@/lib/os/departments/registry"
import { COMPANY_STARTER_PACKS } from "@/lib/company-starter-packs"
import { isPackInstalled, packSkillsSource } from "@/lib/vendored-skills"
import { scanCommandsDir, scanSkillsDir } from "@/lib/skills/scan-helpers"
import type { SkillEntry } from "@/lib/skills/types"
import type { GuideInputs, GuideTeam } from "./render"

export const PACKS_ROOT = path.join(process.cwd(), "templates", "packs")

const COMMANDS_DIR = path.join(".claude", "commands")

async function names(dir: string, pick: (e: Dirent) => boolean, strip = ""): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[])
  return entries.filter(pick).map((e) => (strip ? e.name.replace(strip, "") : e.name))
}

// Hand-written: pack descriptions open with a command list and cut badly when clipped.
export const TEAM_SUMMARY: Record<string, string> = {
  "software-engineering": "Specs, architecture, implementation, tests, debugging, code review and shipping.",
  sales: "Leads and accounts: outreach, proposals and pipeline review.",
  marketing: "Positioning, campaigns, copy, SEO, email, social and launch.",
  "customer-support": "Tickets and contacts: triage, responses, escalation and trends.",
  "hr-people": "Hiring and the employee lifecycle: recruiting, offers, onboarding, reviews and policy.",
  "leadership-team": "Weekly briefings, decision prep and investor updates.",
}

export const teamSummary = (id: string, category: string) =>
  Object.hasOwn(TEAM_SUMMARY, id) ? TEAM_SUMMARY[id] : `${category} team`

export const departmentPurpose = (d: { purpose?: string; tagline?: string }) => d.purpose || d.tagline || ""

/** Metadata only: frontmatter names/descriptions and folder listings. Never skill bodies or record contents. */
export async function readGuideInputs(
  root: string,
  packsRoot: string = PACKS_ROOT
): Promise<{ inputs: GuideInputs; problem: string | null }> {
  const detailed = getCompanyDepartmentsDetailed(root, null)
  const departments = detailed.departments
    .filter((d) => d.source === "custom" || (d.source === "built-in" && d.recordsCount > 0))
    .map((d) => ({ slug: d.slug, name: d.name, purpose: departmentPurpose(d) }))

  const teams: GuideTeam[] = []
  const packNames = new Set<string>() // commands and skills that belong to an installed pack, not to the company itself
  for (const pack of COMPANY_STARTER_PACKS) {
    if (!pack.dirName || !(await isPackInstalled(root, pack.dirName, packsRoot))) continue
    const commands = (await names(path.join(packsRoot, pack.dirName, COMMANDS_DIR), (e) => e.isFile() && e.name.endsWith(".md"), ".md")).sort()
    const source = await packSkillsSource(packsRoot, pack.dirName)
    const skills = await names(source.dir, (e) => e.isDirectory())
    for (const name of [...commands, ...skills]) packNames.add(name)
    teams.push({ id: pack.id, label: pack.label, summary: teamSummary(pack.id, pack.category), commands })
  }

  const [shared, commands, claudeSkills, kiroSkills] = await Promise.all([
    scanSkillsDir("", path.join(root, ".agents", "skills")),
    scanCommandsDir("", path.join(root, ".claude", "commands")),
    scanSkillsDir("", path.join(root, ".claude", "skills")),
    scanSkillsDir("", path.join(root, ".kiro", "skills")),
  ])
  const seen = new Set<string>()
  const own: SkillEntry[] = []
  for (const entry of [...shared, ...commands, ...claudeSkills, ...kiroSkills]) {
    if (seen.has(entry.name) || packNames.has(entry.name)) continue
    seen.add(entry.name)
    own.push(entry)
  }

  return {
    inputs: { departments, teams, commands: own.map((e) => ({ name: e.name, description: e.description })) },
    problem: detailed.definitionsError,
  }
}
