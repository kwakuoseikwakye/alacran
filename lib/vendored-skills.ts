import { readFile } from "node:fs/promises"
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
// a command file only that pack ships. That deliberately also matches companies
// scaffolded BEFORE the skills existed, which is the whole point: those users
// have no UPSTREAM.md at all and would otherwise never receive anything.
//
// Adding a pack is this list plus a case block in the sync script — the button,
// the staleness check and every safety rule below are already pack-agnostic.
// Marker commands must stay unique across templates/packs/*/.claude/commands,
// which a test pins.
export const VENDORED_SKILL_PACKS = [
  { packDirName: "marketing", markerCommand: "draft-campaign.md" },
  { packDirName: "hr-people", markerCommand: "screen-candidate.md" },
  { packDirName: "software-engineering", markerCommand: "plan-feature.md" },
] as const

export const VENDORED_SKILLS_RELATIVE_DIR = path.join(".claude", "skills")

/** Provenance file scripts/sync-vendored-skills.sh writes beside the skills. */
export const VENDORED_STAMP = "UPSTREAM.md"

export type VendoredSkillsUpdate = {
  packDirName: string
  /** Tag the company currently has, or null when it predates vendored skills. */
  installedTag: string | null
  bundledTag: string
}

/** The `Tag:` line scripts/sync-vendored-skills.sh writes into UPSTREAM.md. */
export function parseVendoredTag(upstreamMd: string): string | null {
  return upstreamMd.match(/^Tag:[ \t]+(\S+)[ \t]*$/m)?.[1] ?? null
}

async function readTag(skillsDir: string): Promise<string | null> {
  try {
    return parseVendoredTag(await readFile(path.join(skillsDir, VENDORED_STAMP), "utf-8"))
  } catch {
    return null
  }
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
    if (!(await pathExists(path.join(rootPath, ".claude", "commands", pack.markerCommand)))) continue

    const bundledTag = await readTag(path.join(packsRoot, pack.packDirName, ".claude", "skills"))
    // No stamp on the app's own copy means the sync script hasn't run for this
    // pack — nothing to hand out, and no way to tell staleness if there were.
    if (bundledTag === null) continue

    const installedTag = await readTag(path.join(rootPath, VENDORED_SKILLS_RELATIVE_DIR))
    if (installedTag === bundledTag) continue

    return { packDirName: pack.packDirName, installedTag, bundledTag }
  }
  return null
}
