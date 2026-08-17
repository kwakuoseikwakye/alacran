import { readFile, writeFile, mkdir, stat } from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import { dataPath } from "./data-dir"
import { pathExists } from "./path-exists"

/** `kind` is absent on every entry written before external folders existed,
 *  and absent means "command-set" — so no migration, and an existing registry
 *  keeps behaving exactly as it did. */
export type RegisteredCompany = { id: string; name: string; rootPath: string; kind?: "external" }

const DEFAULT_REGISTRY_PATH = dataPath("companies.json")

export async function getRegisteredCompanies(
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<RegisteredCompany[]> {
  let raw: string
  try {
    raw = await readFile(registryPath, "utf-8")
  } catch {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

export async function registerCompanyImpl(
  name: string,
  rootPath: string,
  registryPath: string = DEFAULT_REGISTRY_PATH,
  kind?: "external"
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  if (!name.trim()) {
    return { ok: false, message: "Name is required" }
  }
  if (!(await isDirectory(rootPath))) {
    return { ok: false, message: "Path does not exist or is not a directory" }
  }
  // An external folder is only ever opened in a terminal, so a repo is not
  // required — the point of that kind is folders that don't follow any of this
  // app's conventions, and demanding `.git` would exclude most of them. Real
  // companies still need it: backup, the activity feed and the commit-on-save
  // paths are all git operations.
  if (kind !== "external" && !(await pathExists(path.join(rootPath, ".git")))) {
    return { ok: false, message: "Path is not a git repository (no .git found)" }
  }
  // `.git` is the only structural requirement. A `.claude` directory used to be
  // demanded too, and it turned out to gate-keep real repos for nothing: it is
  // a Claude-Code adapter artifact, not the portable core (v17), and nothing
  // downstream needs it — genericCommandSetSkillAdapter returns an empty list
  // when the directory is absent, and Open in Terminal / Get Started just run
  // the configured executor in the root. It blocked importing
  // real working agents that have a git repo and no `.claude`, and would
  // equally block restoring a backup of any such repo.

  const companies = await getRegisteredCompanies(registryPath)
  if (companies.some((c) => c.rootPath === rootPath)) {
    return { ok: false, message: "This directory is already registered" }
  }

  const company: RegisteredCompany = {
    id: crypto.randomUUID(),
    name: name.trim(),
    rootPath,
    ...(kind === "external" ? { kind } : {}),
  }
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(registryPath, JSON.stringify([...companies, company], null, 2), "utf-8")
  return { ok: true, company }
}

export async function removeCompanyImpl(
  id: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  const companies = await getRegisteredCompanies(registryPath)
  if (!companies.some((c) => c.id === id)) {
    return { ok: false, message: "Not found" }
  }
  const remaining = companies.filter((c) => c.id !== id)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(registryPath, JSON.stringify(remaining, null, 2), "utf-8")
  return { ok: true }
}

export type CompanyPathStatus = "exists" | "creatable" | "not-creatable"

/**
 * The deepest ancestor of `p` that actually exists on disk, or null if none
 * does. Used to answer "could we mkdir -p our way to this path?" rather than
 * the narrower "does its immediate parent already exist?".
 */
async function nearestExistingAncestor(p: string): Promise<string | null> {
  let current = path.dirname(path.resolve(p))
  for (;;) {
    if (await pathExists(current)) return current
    const parent = path.dirname(current)
    // path.dirname("/") === "/" — the fixed point is how we detect the root.
    if (parent === current) return null
    current = parent
  }
}

export async function getCompanyPathStatusImpl(rootPath: string): Promise<CompanyPathStatus> {
  if (await pathExists(rootPath)) {
    return "exists"
  }
  // Requiring the IMMEDIATE parent to exist made every default-path creation
  // fail on a fresh install: the suggested path is ~/Alacran/<company>, and
  // ~/Alacran itself doesn't exist until the first company is made. The UI
  // then fell through to the register-an-existing-directory branch and
  // reported "Path does not exist or is not a directory", which is true but
  // useless — nothing was wrong except a missing intermediate directory that
  // createCompanyFromTemplateImpl creates anyway. Any missing ancestor chain
  // is fine as long as SOMETHING above it exists and is a directory; a
  // non-directory (a file sitting where a parent should be) still isn't.
  const ancestor = await nearestExistingAncestor(rootPath)
  if (ancestor !== null && (await isDirectory(ancestor))) {
    return "creatable"
  }
  return "not-creatable"
}
