import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { defaultExecFile } from "@/lib/default-exec-file"
import { commitFile } from "@/lib/git-commit-file"
import { movePortableSkills, planPortableSkills } from "@/lib/portable-skills"
import { addGuide } from "@/lib/guide/refresh"
import { PACKS_ROOT } from "@/lib/guide/inventory"
import { createDepartment } from "@/lib/os/departments/mutations"

export const MEASURE_COMPANY_NAME = "Acme Test Co"

async function realpathOfAncestor(p: string): Promise<string> {
  try {
    return await fs.realpath(p)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    const parent = path.dirname(p)
    if (parent === p) throw err
    return path.join(await realpathOfAncestor(parent), path.basename(p))
  }
}

/** Refuses anything that is not under the real temp directory. The measurement must never write elsewhere. */
export async function assertUnderTmp(target: string): Promise<void> {
  const tmp = await fs.realpath(os.tmpdir())
  const real = await realpathOfAncestor(path.resolve(target))
  if (real !== tmp && !real.startsWith(tmp + path.sep)) {
    throw new Error(`Refusing to build outside the temp directory: ${target}`)
  }
}

const git = (root: string, ...args: string[]) => defaultExecFile("git", ["-C", root, ...args])

/**
 * A company built from the bundled template and the Sales team, like a real scaffold but WITHOUT touching the
 * owner's company registry or Claude's folder-trust file (createCompanyFromTemplateImpl does both).
 */
export async function buildMeasureCompany(opts: {
  parent: string
  name: string
  withGuide: boolean
  templatesRoot?: string
}): Promise<{ root: string }> {
  await assertUnderTmp(opts.parent)
  const root = path.join(opts.parent, opts.name)
  await assertUnderTmp(root)
  const templates = opts.templatesRoot ?? path.join(process.cwd(), "templates")
  const skip = (src: string) => path.basename(src) !== ".DS_Store"

  await fs.mkdir(root, { recursive: true })
  await fs.cp(path.join(templates, "company-starter"), root, { recursive: true, filter: skip })
  await fs.cp(path.join(templates, "packs", "sales"), root, { recursive: true, force: true, filter: skip })
  const moved = await movePortableSkills(root, await planPortableSkills(root, path.join(templates, "packs")))
  if (!moved.ok) throw new Error(moved.message)

  await git(root, "init", "-q")
  await git(root, "config", "user.email", "measure@example.invalid")
  await git(root, "config", "user.name", "Guide measurement")
  await git(root, "add", "-A")
  await git(root, "commit", "-q", "-m", "measurement company")

  const dept = await createDepartment(root, { name: "Legal", purpose: "Contracts and compliance.", color: "#0369a1" })
  if (!dept.ok) throw new Error(`Could not add the department: ${dept.error}`)

  if (opts.withGuide) {
    const added = await addGuide(root, { exec: defaultExecFile, packsRoot: PACKS_ROOT })
    if (!added.ok) throw new Error(`Could not add the guide: ${added.error}`)
    await commitFile(root, ["AGENTS.md"], "add the operating guide", defaultExecFile)
  }
  return { root }
}
