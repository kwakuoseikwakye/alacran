import { stat, writeFile, mkdir, cp } from "node:fs/promises"
import path from "node:path"
import { registerCompanyImpl, type RegisteredCompany } from "./companies-registry"
import { TEMPLATE_MANIFEST, FRESH_HANDOFF_CONTENT } from "./company-template-manifest"
import { pathExists } from "./path-exists"
import { copyNew } from "./copy-new"
import { commitFile, type ExecFileFn } from "./git-commit-file"
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Adopt a folder the user already works in as a full company, in place.
 *
 * The alternative considered and rejected was a wrapper company under
 * ~/Alacran/ holding a symlink to the real folder. It fails twice:
 * `resolveWithinAgentRoot` (path-guard.ts) realpaths both sides and requires
 * containment, so every guarded read/write through the link resolves outside
 * the root and is denied; and `git add -A` stores a symlink as a symlink, so
 * Backup, the activity feed and commit-on-save would all cover an empty
 * wrapper while reporting success. Location buys nothing either — v65
 * established that registration alone grants the full feature set
 * (`getEffectiveAgents` maps every registered company to `command-set`), so a
 * folder does not have to live under ~/Alacran/ to be one.
 *
 * What this does instead: add the starter files that aren't there, make sure
 * there's a git repo, register it. Additive throughout — `copyNew` is the same
 * never-overwrite rule adding a starter pack uses, so the user's own
 * README.md, .gitignore or .claude/commands/<their command>.md survive.
 */
export async function adoptFolderImpl(
  name: string,
  rootPath: string,
  templateSourcePath: string,
  registryPath?: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<{ ok: true; company: RegisteredCompany; added: string[] } | { ok: false; message: string }> {
  if (!(await isDirectory(rootPath))) {
    return { ok: false, message: "That folder doesn't exist on this computer" }
  }
  // Same loud failure as the create flow: copyNew skips a missing source
  // silently, which is right per-entry and catastrophic for the whole tree —
  // a packaging slip would otherwise "adopt" a folder and add nothing.
  if (!(await pathExists(templateSourcePath))) {
    return {
      ok: false,
      message: `The bundled company template is missing from this install (${templateSourcePath}). Reinstall Alacrán, or report this if it persists.`,
    }
  }

  const added: string[] = []
  try {
    for (const relativePath of TEMPLATE_MANIFEST) {
      const source = path.join(templateSourcePath, relativePath)
      if (!(await pathExists(source))) continue
      const target = path.join(rootPath, relativePath)
      if (await isDirectory(source)) {
        // Per-child, not per-entry. An existing `.claude/commands` of the
        // user's own would otherwise skip the whole directory and leave the
        // company without a single command the app runs.
        const names = await copyNew(source, target)
        added.push(...names.map((n) => path.join(relativePath, n)))
      } else if (!(await pathExists(target))) {
        await mkdir(path.dirname(target), { recursive: true })
        await cp(source, target, { filter: (src) => path.basename(src) !== ".DS_Store" })
        added.push(relativePath)
      }
    }

    if (!(await pathExists(path.join(rootPath, "HANDOFF.md")))) {
      await writeFile(path.join(rootPath, "HANDOFF.md"), FRESH_HANDOFF_CONTENT, "utf-8")
      added.push("HANDOFF.md")
    }

    if (await pathExists(path.join(rootPath, ".git"))) {
      // Their repo, their history: pathspec-scoped to exactly what was added,
      // so uncommitted work of theirs is never swept into our commit. A failed
      // commit is not a failed adoption — the files are right on disk (same
      // call as add-company-pack.ts).
      if (added.length > 0) {
        try {
          await commitFile(rootPath, added, "Add Alacrán's company files", execFn)
        } catch {
          // Deliberately ignored, as above.
        }
      }
    } else {
      // No repo, so Backup, the activity feed and commit-on-save have nothing
      // to work with. The first commit contains their existing work because
      // that is what initialising a repo over it means; the .gitignore just
      // copied in keeps node_modules and friends out of it.
      await execFn("git", ["-C", rootPath, "init"])
      await execFn("git", ["-C", rootPath, "add", "-A"])
      await execFn("git", ["-C", rootPath, "commit", "-m", "Initial commit — folder adopted by Alacrán"])
    }
  } catch (err) {
    return {
      ok: false,
      message: `Failed to set up this folder: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const result = await registerCompanyImpl(name, rootPath, registryPath)
  return result.ok ? { ...result, added } : result
}
