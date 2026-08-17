import { readdir, cp, rm, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { getVendoredSkillsUpdate, VENDORED_SKILLS_RELATIVE_DIR, VENDORED_STAMP } from "./vendored-skills"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"
import { pathExists } from "./path-exists"

export async function updateCompanySkillsImpl(
  agentId: string,
  packsRoot: string,
  execFn?: ExecFileFn
): Promise<{ ok: true; tag: string; skipped: string[] } | { ok: false; message: string }> {
  const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
  if (!agent) {
    return { ok: false, message: "Unknown company" }
  }
  // Same gate as every other company feature (v66): a new capability is off for
  // an `external` folder unless it opts in, and this one writes files.
  if (agent.kind !== "command-set") {
    return { ok: false, message: "This kind of folder has no skills to update" }
  }

  const update = await getVendoredSkillsUpdate(agent.rootPath, packsRoot)
  if (!update) {
    return { ok: false, message: "This company is already up to date" }
  }

  const source = path.join(packsRoot, update.packDirName, ".claude", "skills")
  const target = path.join(agent.rootPath, VENDORED_SKILLS_RELATIVE_DIR)
  // A company with no stamp was scaffolded before vendored skills existed, so
  // NOTHING in its .claude/skills came from this app — every name there is the
  // user's own work, and the bundled names are exactly the ones a marketing
  // company's user picks for their own (copywriting, social, emails, cro…).
  // Overwriting one would break this feature's own promise that skills you
  // wrote are left alone, and an uncommitted one is not recoverable from git.
  // So: skip what we cannot prove we installed, and report it.
  //
  // ponytail: stamp presence is directory-level proof, not per-entry. A stamped
  // company that hand-wrote a skill whose name a LATER upstream tag introduces
  // would still be overwritten. Close that by listing the installed entry names
  // in UPSTREAM.md if it ever bites — it needs a stamp-format change, not
  // logic here.
  const canReplaceExisting = update.installedTag !== null
  const copied: string[] = []
  const skipped: string[] = []

  try {
    const all = await readdir(source)
    await mkdir(target, { recursive: true })

    // Replace the vendored entries one by one, NEVER the whole skills directory:
    // the user's own skills live in there too, and so does daily-team-log (v20).
    // A skill dropped upstream therefore lingers in the company rather than
    // being deleted — the safe direction, since this code cannot tell an
    // abandoned vendored skill from one the user has come to rely on.
    for (const name of all.filter((n) => n !== VENDORED_STAMP)) {
      const targetEntry = path.join(target, name)
      if (!canReplaceExisting && (await pathExists(targetEntry))) {
        skipped.push(name)
        continue
      }
      await rm(targetEntry, { recursive: true, force: true })
      await cp(path.join(source, name), targetEntry, { recursive: true })
      copied.push(name)
    }

    // The stamp goes LAST, and only on a complete install. It is the app's
    // record of what is installed and the button compares nothing else, so
    // writing it early — or writing it after skipping something — strands the
    // company: it claims a version it does not have, the button disappears, and
    // worse, the skipped names become app-owned, so the NEXT update would
    // delete the user's work. Stamp-last also makes a mid-copy throw simply
    // retryable, since the old tag is still what's on disk.
    if (skipped.length === 0 && all.includes(VENDORED_STAMP)) {
      await rm(path.join(target, VENDORED_STAMP), { recursive: true, force: true })
      await cp(path.join(source, VENDORED_STAMP), path.join(target, VENDORED_STAMP))
      copied.push(VENDORED_STAMP)
    }
  } catch (err) {
    return {
      ok: false,
      message: `Failed to update skills: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Path-scoped to exactly what was written, so a skill the user is midway
  // through writing in the same directory is never swept into this commit.
  //
  // A failed commit must not fail the update — the files are already correct on
  // disk, and .claude/ is gitignored in some real repos (same call as v61's).
  try {
    await commitFile(
      agent.rootPath,
      copied.map((name) => path.join(VENDORED_SKILLS_RELATIVE_DIR, name)),
      `Update ${update.packDirName} skills to ${update.bundledTag} via Alacrán`,
      execFn
    )
  } catch {
    // Intentionally ignored — see above.
  }

  return { ok: true, tag: update.bundledTag, skipped }
}
