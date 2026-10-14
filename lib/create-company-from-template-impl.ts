import { isDirectory } from "./path-exists"
import { defaultExecFile } from "./default-exec-file"
import { mkdir, writeFile, cp } from "node:fs/promises"
import path from "node:path"
import { gitCommit, type ExecFileFn } from "./git-commit-file"
import { trustCompanyDirImpl } from "./trust-company-dir"
import { registerCompanyImpl, type RegisteredCompany } from "./companies-registry"
import { TEMPLATE_MANIFEST, FRESH_HANDOFF_CONTENT, INITIAL_COMMIT_MESSAGE } from "./company-template-manifest"
import { pathExists } from "./path-exists"
import { movePortableSkills, planPortableSkills } from "./portable-skills"

async function copyManifestEntry(sourceRoot: string, targetRoot: string, relativePath: string): Promise<void> {
  const source = path.join(sourceRoot, relativePath)
  if (!(await pathExists(source))) return
  const target = path.join(targetRoot, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await cp(source, target, {
    recursive: true,
    filter: (src) => path.basename(src) !== ".DS_Store",
  })
}

export async function createCompanyFromTemplateImpl(
  name: string,
  rootPath: string,
  templateSourcePath: string,
  packSourcePath?: string,
  registryPath?: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  if (await pathExists(rootPath)) {
    return { ok: false, message: "This path already exists" }
  }
  // Deliberately NOT requiring the immediate parent to exist — the default
  // suggested path is ~/Alacran/<company>, and ~/Alacran itself doesn't exist
  // until the first company is created. The recursive mkdir below handles any
  // missing intermediate directories; what still has to be rejected is a
  // parent path that exists but isn't a directory, since mkdir -p can't
  // create a directory underneath a file.
  const parent = path.dirname(rootPath)
  if ((await pathExists(parent)) && !(await isDirectory(parent))) {
    return { ok: false, message: "That location isn't a folder" }
  }

  // copyManifestEntry skips a missing entry on purpose (the manifest lists
  // optional paths), which is fine per-file and catastrophic for the whole
  // directory: a packaging slip that moved templates/company-starter made every
  // scaffold "succeed" while producing a company with no CLAUDE.md, no
  // .claude/commands, no verify.py and no ontology starter — silently, in four
  // shipped releases. Fail loudly instead: if the skeleton isn't there, nothing
  // downstream can be right.
  if (!(await pathExists(templateSourcePath))) {
    return {
      ok: false,
      message: `The bundled company template is missing from this install (${templateSourcePath}). Reinstall Alacrán, or report this if it persists.`,
    }
  }

  try {
    await mkdir(rootPath, { recursive: true })

    for (const relativePath of TEMPLATE_MANIFEST) {
      await copyManifestEntry(templateSourcePath, rootPath, relativePath)
    }

    // A starter pack is a small overlay (a tailored ontology, a couple of
    // shape-specific commands) on top of the base skeleton above — never a
    // second full tree, and never anything outside the manifest's own shape.
    // Copied after the manifest so a pack file (e.g.
    // definitions/ontology/company.yaml, which the base skeleton never
    // ships filled-in) lands into a directory the manifest copy already
    // created.
    if (packSourcePath && (await pathExists(packSourcePath))) {
      await cp(packSourcePath, rootPath, {
        recursive: true,
        force: true,
        filter: (src) => path.basename(src) !== ".DS_Store",
      })
    }

    // The template and packs ship their commands flat, in `.claude/commands`, a folder only Claude Code
    // reads. Move them to `.agents/skills` (and generate the Claude Code and Kiro copies) before the
    // first commit, so a company starts readable by every agent instead of waiting for the button.
    // Not best-effort: a half-moved company is worse than a failed scaffold. The pack skills the app
    // owns stay where they are, same as the button leaves them.
    const moved = await movePortableSkills(
      rootPath,
      await planPortableSkills(rootPath, path.join(path.dirname(templateSourcePath), "packs"))
    )
    if (!moved.ok) throw new Error(moved.message)

    await writeFile(path.join(rootPath, "HANDOFF.md"), FRESH_HANDOFF_CONTENT, "utf-8")

    await execFn("git", ["-C", rootPath, "init"])
    await execFn("git", ["-C", rootPath, "add", "-A"])
    // A machine with no git identity cannot commit at all, which used to fail
    // the whole scaffold and stop a new user at their first company. See
    // gitCommit.
    await gitCommit(rootPath, ["commit", "-m", INITIAL_COMMIT_MESSAGE], execFn)

    // Everything in this directory was written by the app from its own bundled
    // template a few lines ago, so Claude Code's trust prompt has no
    // third-party content to protect the user from here — and until it is
    // answered the template's own .claude/settings.json is ignored, which is
    // what made a brand-new company deny `git status` to the first agent that
    // opened it. Deliberately scoped to the scaffold path: a REGISTERED or
    // ADOPTED directory holds files this app did not write, and there the
    // prompt is doing its job.
    //
    // Never allowed to fail the scaffold — the company is already built and
    // committed by this point, and this touches a config file the app does not
    // own. Losing costs one prompt, not the company.
    await trustCompanyDirImpl(rootPath).catch(() => false)
  } catch (err) {
    return {
      ok: false,
      message: `Failed to scaffold company: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  return registerCompanyImpl(name, rootPath, registryPath)
}
