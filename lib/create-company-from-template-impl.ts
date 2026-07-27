import { mkdir, writeFile, stat, cp } from "node:fs/promises"
import path from "node:path"
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import type { ExecFileFn } from "./git-commit-file"
import { registerCompanyImpl, type RegisteredCompany } from "./companies-registry"
import { TEMPLATE_MANIFEST, FRESH_HANDOFF_CONTENT } from "./company-template-manifest"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
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
  registryPath?: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  if (await pathExists(rootPath)) {
    return { ok: false, message: "This path already exists" }
  }
  if (!(await isDirectory(path.dirname(rootPath)))) {
    return { ok: false, message: "Parent directory does not exist" }
  }

  try {
    await mkdir(rootPath)

    for (const relativePath of TEMPLATE_MANIFEST) {
      await copyManifestEntry(templateSourcePath, rootPath, relativePath)
    }

    await writeFile(path.join(rootPath, "HANDOFF.md"), FRESH_HANDOFF_CONTENT, "utf-8")

    await execFn("git", ["-C", rootPath, "init"])
    await execFn("git", ["-C", rootPath, "add", "-A"])
    await execFn("git", ["-C", rootPath, "commit", "-m", "Initial commit from ai-company-starter-main template"])
  } catch (err) {
    return {
      ok: false,
      message: `Failed to scaffold company: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  return registerCompanyImpl(name, rootPath, registryPath)
}
