import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { pathExists } from "./path-exists"

// Skills vendored from a third party (scripts/sync-vendored-skills.sh) are the
// one part of a scaffolded company the app OWNS: they are stamped with their
// upstream tag, marked do-not-hand-edit, and replaced wholesale on update. That
// is what makes updating an existing company a copy instead of a merge — the
// files a user actually edits (their ontology, notes, their own skills) are
// never touched by any of this.
//
// A company records nothing about which pack it came from, so it is matched by
// the commands that pack ships (see isPackInstalled). That deliberately also
// matches companies scaffolded BEFORE the skills existed, which is the whole
// point: those users have no UPSTREAM.md at all and would otherwise never
// receive anything.
//
// Adding a pack is this list plus a case block in the sync script — the button,
// the staleness check and every safety rule below are already pack-agnostic.
export const VENDORED_SKILL_PACKS: { packDirName: string }[] = [
  { packDirName: "marketing" },
  { packDirName: "hr-people" },
  { packDirName: "software-engineering" },
  { packDirName: "customer-support" },
]

export const VENDORED_SKILLS_RELATIVE_DIR = path.join(".claude", "skills")

const COMMANDS_RELATIVE_DIR = path.join(".claude", "commands")

/**
 * Bundled command filenames per pack. Memoized because both callers below sit
 * on the `force-dynamic` Agents render, once per company, and templates/ cannot
 * change while the app is running.
 */
const packCommandsCache = new Map<string, string[]>()

async function packCommands(packsRoot: string, packDirName: string): Promise<string[]> {
  const key = path.join(packsRoot, packDirName)
  const hit = packCommandsCache.get(key)
  if (hit) return hit
  const names: string[] = await readdir(path.join(key, COMMANDS_RELATIVE_DIR)).catch(() => [])
  packCommandsCache.set(key, names)
  return names
}

/**
 * Whether a company holds this pack, judged by whether any of the pack's own
 * commands is in it.
 *
 * Derived from the pack directory rather than a hand-maintained marker
 * filename per pack: two answers to "which packs does this company have" WILL
 * drift, and when they disagree the symptom is a skill being judged app-owned
 * by one caller and user-owned by the other — either an edit silently
 * overwritten by the next update, or an update that refuses to land. One
 * source, derived from the files themselves, cannot fall out of step.
 *
 * The invariant this needs is that no command filename is shared between two
 * packs or with the base template, which a test pins.
 */
export async function isPackInstalled(
  rootPath: string,
  packDirName: string,
  packsRoot: string
): Promise<boolean> {
  const own: string[] = await readdir(path.join(rootPath, COMMANDS_RELATIVE_DIR)).catch(() => [])
  if (own.length === 0) return false
  const bundled = await packCommands(packsRoot, packDirName)
  return bundled.some((name) => own.includes(name))
}

/** Provenance file scripts/sync-vendored-skills.sh writes beside the skills. */
export const VENDORED_STAMP = "UPSTREAM.md"

/**
 * What that stamp is called once it lands in a company: one per pack, because
 * a company can hold more than one.
 *
 * With a single shared UPSTREAM.md, a company that gained a second pack had one
 * tag standing in for two — so each pack in turn looked stale against the other
 * pack's tag, and the update button flip-flopped between them forever, restamping
 * on every press.
 *
 * The legacy name is still read (never written, never deleted) as the stamp of
 * whichever pack the company was scaffolded from. That pack keeps reading it and
 * stays correct; a pack added later writes its own file on install, so no
 * migration runs and a company that had files copied in by hand heals itself the
 * first time its update lands.
 */
export function packStampName(packDirName: string): string {
  return `UPSTREAM-${packDirName}.md`
}

export type VendoredSkillsUpdate = {
  packDirName: string
  /** Tag the company currently has, or null when it predates vendored skills. */
  installedTag: string | null
  bundledTag: string
}

/**
 * The `Tag:` line scripts/sync-vendored-skills.sh writes into UPSTREAM.md.
 * A pin is an upstream tag where one exists and a commit SHA where none does,
 * so this deliberately does not care which — it only has to compare equal.
 */
export function parseVendoredTag(upstreamMd: string): string | null {
  return upstreamMd.match(/^Tag:[ \t]+(\S+)[ \t]*$/m)?.[1] ?? null
}

async function readTag(skillsDir: string, stampName: string = VENDORED_STAMP): Promise<string | null> {
  try {
    return parseVendoredTag(await readFile(path.join(skillsDir, stampName), "utf-8"))
  } catch {
    return null
  }
}

/** This pack's own stamp, falling back to the legacy shared one. */
async function readInstalledTag(skillsDir: string, packDirName: string): Promise<string | null> {
  return (await readTag(skillsDir, packStampName(packDirName))) ?? (await readTag(skillsDir))
}

/**
 * Null when there is nothing to offer: the company came from no pack that
 * vendors skills, the app ships none for it, or it already has this tag.
 *
 * Three small file reads per company, no subprocess — safe to call from a
 * force-dynamic page, unlike anything that shells out (see v70).
 */
export async function getVendoredSkillsUpdate(
  rootPath: string,
  packsRoot: string
): Promise<VendoredSkillsUpdate | null> {
  for (const pack of VENDORED_SKILL_PACKS) {
    if (!(await isPackInstalled(rootPath, pack.packDirName, packsRoot))) continue

    const bundledTag = await readTag(path.join(packsRoot, pack.packDirName, ".claude", "skills"))
    // No stamp on the app's own copy means the sync script hasn't run for this
    // pack — nothing to hand out, and no way to tell staleness if there were.
    if (bundledTag === null) continue

    const installedTag = await readInstalledTag(path.join(rootPath, VENDORED_SKILLS_RELATIVE_DIR), pack.packDirName)
    if (installedTag === bundledTag) continue

    return { packDirName: pack.packDirName, installedTag, bundledTag }
  }
  return null
}

/**
 * True when this file belongs to a skill the APP installed and therefore owns.
 *
 * These are read-only by design: the app replaces the vendored tree wholesale on
 * every update, so a local edit would be silently destroyed the next time one
 * lands. Blocking the edit is the honest version of that — better than accepting
 * work and overwriting it later. To customise one, copy it to a new name; a
 * skill the app does not ship stays yours and is never touched.
 *
 * A company with no stamp is NOT covered: nothing in its .claude/skills came
 * from the app (v77), so those files remain the user's to edit even when a name
 * matches a bundled one.
 *
 * `rootPath` and `filePath` must be resolved the same way — both realpath'd, or
 * neither — since this compares them as strings (see path-guard.ts).
 */
export async function isAppManagedSkillPath(
  rootPath: string,
  filePath: string,
  packsRoot: string = path.join(process.cwd(), "templates", "packs")
): Promise<boolean> {
  const skillsDir = path.join(rootPath, VENDORED_SKILLS_RELATIVE_DIR)
  const rel = path.relative(skillsDir, filePath)
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return false

  const skillName = rel.split(path.sep)[0]

  for (const pack of VENDORED_SKILL_PACKS) {
    if (!(await isPackInstalled(rootPath, pack.packDirName, packsRoot))) continue
    // Stamped for THIS pack (or by the legacy shared stamp) — an unstamped pack's
    // skills are the user's own, per the v77 rule above.
    if ((await readInstalledTag(skillsDir, pack.packDirName)) === null) continue
    // Keep looking rather than returning the first pack's answer: a company
    // holding two packs would otherwise have the second pack's skills judged
    // against the first pack's file list, come back "yours to edit", and be
    // overwritten by the next update anyway.
    if (await pathExists(path.join(packsRoot, pack.packDirName, ".claude", "skills", skillName))) return true
  }
  return false
}
