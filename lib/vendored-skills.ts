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

const CANONICAL_SKILLS_RELATIVE_DIR = path.join(".agents", "skills")

/** Where a company keeps the skills the app vendored: the folder every agent reads. */
export const SHARED_SKILLS_RELATIVE_DIR = CANONICAL_SKILLS_RELATIVE_DIR

/**
 * Where the stamps live. Deliberately outside every skills folder: a flat `.md` next to the skill
 * folders is something an agent might try to load as a skill (Kimi documents a flat form and has
 * never been measured here), and a stamp is provenance, not a skill.
 */
export const VENDORED_STAMP_RELATIVE_DIR = path.join(".agents", "vendored")

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

/** Names of the commands a company holds, in either shape: flat `.claude/commands/<n>.md` or moved to `.agents/skills/<n>/`. */
async function ownCommandNames(rootPath: string): Promise<Set<string>> {
  const flat: string[] = await readdir(path.join(rootPath, COMMANDS_RELATIVE_DIR)).catch(() => [])
  const moved: string[] = await readdir(path.join(rootPath, CANONICAL_SKILLS_RELATIVE_DIR), { withFileTypes: true })
    .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
    .catch(() => [])
  return new Set([...flat.map((name) => name.replace(/\.md$/, "")), ...moved])
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
 *
 * A command counts whether it is still a flat `.claude/commands/<n>.md` or has
 * moved to `.agents/skills/<n>/` (see portable-skills.ts): moving them must not
 * make the company forget which pack it holds.
 */
export async function isPackInstalled(
  rootPath: string,
  packDirName: string,
  packsRoot: string
): Promise<boolean> {
  const own = await ownCommandNames(rootPath)
  if (own.size === 0) return false
  const bundled = await packCommands(packsRoot, packDirName)
  return bundled.some((name) => own.has(name.replace(/\.md$/, "")))
}

/**
 * Where a pack keeps its skills, and its stamp, inside templates/packs/<pack>.
 *
 * The shared layout once the pack has been moved there; the legacy `.claude/skills` (stamp beside the
 * skills) until then, so one code path serves both and the move of the files can land as its own commit.
 */
export async function packSkillsSource(
  packsRoot: string,
  packDirName: string
): Promise<{ dir: string; stampPath: string; shared: boolean }> {
  const shared = path.join(packsRoot, packDirName, CANONICAL_SKILLS_RELATIVE_DIR)
  if (await pathExists(shared)) {
    return {
      dir: shared,
      stampPath: path.join(packsRoot, packDirName, VENDORED_STAMP_RELATIVE_DIR, packStampName(packDirName)),
      shared: true,
    }
  }
  const legacy = path.join(packsRoot, packDirName, VENDORED_SKILLS_RELATIVE_DIR)
  return { dir: legacy, stampPath: path.join(legacy, VENDORED_STAMP), shared: false }
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
  /** Set only when the tag is current but the skills still sit in `.claude/skills`: applying moves them. */
  movesLocation?: true
}

/**
 * The `Tag:` line scripts/sync-vendored-skills.sh writes into UPSTREAM.md.
 * A pin is an upstream tag where one exists and a commit SHA where none does,
 * so this deliberately does not care which — it only has to compare equal.
 */
export function parseVendoredTag(upstreamMd: string): string | null {
  return upstreamMd.match(/^Tag:[ \t]+(\S+)[ \t]*$/m)?.[1] ?? null
}

async function readTagFile(file: string): Promise<string | null> {
  try {
    return parseVendoredTag(await readFile(file, "utf-8"))
  } catch {
    return null
  }
}

/**
 * This pack's stamp in the company: the shared layout's, then the per-pack legacy one, then the legacy
 * shared UPSTREAM.md (the stamp of the pack the company was scaffolded from).
 */
async function readInstalledTag(rootPath: string, packDirName: string): Promise<string | null> {
  const legacy = path.join(rootPath, VENDORED_SKILLS_RELATIVE_DIR)
  return (
    (await readTagFile(path.join(rootPath, VENDORED_STAMP_RELATIVE_DIR, packStampName(packDirName)))) ??
    (await readTagFile(path.join(legacy, packStampName(packDirName)))) ??
    (await readTagFile(path.join(legacy, VENDORED_STAMP)))
  )
}

/** Whether a skill the pack ships still sits only in `.claude/skills`, i.e. has not moved to the shared folder. */
async function hasLegacyLayout(rootPath: string, packSkillsDir: string): Promise<boolean> {
  const names = await readdir(packSkillsDir, { withFileTypes: true }).catch(() => [])
  for (const entry of names) {
    if (!entry.isDirectory()) continue
    const legacy = path.join(rootPath, VENDORED_SKILLS_RELATIVE_DIR, entry.name, "SKILL.md")
    const shared = path.join(rootPath, CANONICAL_SKILLS_RELATIVE_DIR, entry.name)
    if ((await pathExists(legacy)) && !(await pathExists(shared))) return true
  }
  return false
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

    const source = await packSkillsSource(packsRoot, pack.packDirName)
    const bundledTag = await readTagFile(source.stampPath)
    // No stamp on the app's own copy means the sync script hasn't run for this
    // pack — nothing to hand out, and no way to tell staleness if there were.
    if (bundledTag === null) continue

    const installedTag = await readInstalledTag(rootPath, pack.packDirName)
    if (installedTag === bundledTag) {
      // Current, but a company made before the skills moved still holds them where only Claude Code
      // reads. A stamped company is the app's to relocate; an unstamped one never got them from us.
      if (installedTag !== null && source.shared && (await hasLegacyLayout(rootPath, source.dir))) {
        return { packDirName: pack.packDirName, installedTag, bundledTag, movesLocation: true }
      }
      continue
    }

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
  // The editable source is the shared folder; the legacy `.claude/skills` is still claimed for companies
  // that have not been moved (and for the generated copies, which are protected twice over).
  for (const dir of [CANONICAL_SKILLS_RELATIVE_DIR, VENDORED_SKILLS_RELATIVE_DIR]) {
    const rel = path.relative(path.join(rootPath, dir), filePath)
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) continue

    const skillName = rel.split(path.sep)[0]

    for (const pack of VENDORED_SKILL_PACKS) {
      if (!(await isPackInstalled(rootPath, pack.packDirName, packsRoot))) continue
      // Stamped for THIS pack (or by the legacy shared stamp) — an unstamped pack's
      // skills are the user's own, per the v77 rule above.
      if ((await readInstalledTag(rootPath, pack.packDirName)) === null) continue
      // Keep looking rather than returning the first pack's answer: a company
      // holding two packs would otherwise have the second pack's skills judged
      // against the first pack's file list, come back "yours to edit", and be
      // overwritten by the next update anyway.
      if (await pathExists(path.join((await packSkillsSource(packsRoot, pack.packDirName)).dir, skillName))) return true
    }
  }
  return false
}
