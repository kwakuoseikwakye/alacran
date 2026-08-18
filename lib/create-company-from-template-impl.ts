import { mkdir, writeFile, stat, cp } from "node:fs/promises"
import path from "node:path"
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import type { ExecFileFn } from "./git-commit-file"
import { registerCompanyImpl, type RegisteredCompany } from "./companies-registry"
import { TEMPLATE_MANIFEST, FRESH_HANDOFF_CONTENT } from "./company-template-manifest"
import { pathExists } from "./path-exists"

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

    await writeFile(path.join(rootPath, "HANDOFF.md"), FRESH_HANDOFF_CONTENT, "utf-8")

    await execFn("git", ["-C", rootPath, "init"])
    await execFn("git", ["-C", rootPath, "add", "-A"])
    await execFn("git", ["-C", rootPath, "commit", "-m", "Initial commit from company starter template"])
  } catch (err) {
    return {
      ok: false,
      message: `Failed to scaffold company: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  return registerCompanyImpl(name, rootPath, registryPath)
}
