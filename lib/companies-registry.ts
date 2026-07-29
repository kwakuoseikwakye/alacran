import { readFile, writeFile, mkdir, stat } from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import { dataPath } from "./data-dir"

export type RegisteredCompany = { id: string; name: string; rootPath: string }

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

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

export async function registerCompanyImpl(
  name: string,
  rootPath: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  if (!name.trim()) {
    return { ok: false, message: "Name is required" }
  }
  if (!(await isDirectory(rootPath))) {
    return { ok: false, message: "Path does not exist or is not a directory" }
  }
  if (!(await exists(path.join(rootPath, ".git")))) {
    return { ok: false, message: "Path is not a git repository (no .git found)" }
  }
  if (!(await exists(path.join(rootPath, ".claude")))) {
    return { ok: false, message: "Path has no .claude directory" }
  }

  const companies = await getRegisteredCompanies(registryPath)
  if (companies.some((c) => c.rootPath === rootPath)) {
    return { ok: false, message: "This directory is already registered" }
  }

  const company: RegisteredCompany = { id: crypto.randomUUID(), name: name.trim(), rootPath }
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

export async function getCompanyPathStatusImpl(rootPath: string): Promise<CompanyPathStatus> {
  if (await exists(rootPath)) {
    return "exists"
  }
  if (await isDirectory(path.dirname(rootPath))) {
    return "creatable"
  }
  return "not-creatable"
}
