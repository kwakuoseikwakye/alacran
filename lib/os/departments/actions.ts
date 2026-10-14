"use server"

import { revalidatePath } from "next/cache"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { readDefinitions, type DepartmentDefinition } from "./definitions"
import {
  addRecord, createDepartment, editDepartment, fail, planRemoval, removeDepartment, retryCommit,
  type Failure, type RemovalPlan,
} from "./mutations"

async function defaultResolveRoot(companyId: string): Promise<string | null> {
  return (await getEffectiveAgents()).find((a) => a.id === companyId)?.rootPath ?? null
}

const unknown = (companyId: string): Failure => ({ ok: false, code: "not-found", error: `Company not found: ${companyId}` })
const crashed = (err: unknown): Failure => ({ ok: false, code: "failed", error: err instanceof Error ? err.message : String(err) })

function refresh(revalidate: (p: string) => void, companyId: string, slug?: string) {
  revalidate(`/c/${companyId}/records`)
  if (slug) revalidate(`/c/${companyId}/records/${slug}`)
  revalidate(`/c/${companyId}/dashboard`)
}

type CreateInput = { name: string; purpose: string; color: string; adopt?: boolean; operationId?: string }
type EditInput = { slug: string; name: string; purpose: string; color: string; expectedRevision: string }

export async function createDepartmentActionImpl(
  companyId: string,
  input: CreateInput,
  deps = { resolveRoot: defaultResolveRoot, create: createDepartment, revalidate: revalidatePath as (p: string) => void }
) {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return unknown(companyId)
    const res = await deps.create(root, input)
    if (res.ok) refresh(deps.revalidate, companyId, res.slug)
    return res
  } catch (err) {
    return crashed(err)
  }
}

export async function editDepartmentActionImpl(
  companyId: string,
  input: EditInput,
  deps = { resolveRoot: defaultResolveRoot, edit: editDepartment, revalidate: revalidatePath as (p: string) => void }
) {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return unknown(companyId)
    const res = await deps.edit(root, input)
    if (res.ok) refresh(deps.revalidate, companyId, input.slug)
    return res
  } catch (err) {
    return crashed(err)
  }
}

/** What an edit card needs before it can save: the department as it is now, and the revision it was read at. */
export async function getDepartmentForEditActionImpl(
  companyId: string,
  slug: string,
  deps = { resolveRoot: defaultResolveRoot, read: readDefinitions }
): Promise<{ ok: true; department: DepartmentDefinition; revision: string } | Failure> {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return unknown(companyId)
    const defs = deps.read(root)
    if (!defs.ok) return fail("malformed", defs.error)
    const department = defs.departments.find((d) => d.slug === slug)
    if (!department) return fail("not-found", "Only departments you created can be edited here.")
    return { ok: true, department, revision: defs.revision }
  } catch (err) {
    return crashed(err)
  }
}

export async function planRemovalActionImpl(
  companyId: string,
  slug: string,
  deps = { resolveRoot: defaultResolveRoot, plan: planRemoval }
) {
  try {
    const root = await deps.resolveRoot(companyId)
    return root ? await deps.plan(root, slug) : unknown(companyId)
  } catch (err) {
    return crashed(err)
  }
}

export async function removeDepartmentActionImpl(
  companyId: string,
  input: { slug: string; expectedRevision: string; confirm: RemovalPlan },
  deps = { resolveRoot: defaultResolveRoot, remove: removeDepartment, revalidate: revalidatePath as (p: string) => void }
) {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return unknown(companyId)
    const res = await deps.remove(root, input)
    if (res.ok) refresh(deps.revalidate, companyId, input.slug)
    return res
  } catch (err) {
    return crashed(err)
  }
}

export async function addRecordActionImpl(
  companyId: string,
  input: { slug: string; title: string; body: string },
  deps = { resolveRoot: defaultResolveRoot, add: addRecord, revalidate: revalidatePath as (p: string) => void }
) {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return unknown(companyId)
    const res = await deps.add(root, input)
    if (res.ok) refresh(deps.revalidate, companyId, input.slug)
    return res
  } catch (err) {
    return crashed(err)
  }
}

export async function retryCommitActionImpl(
  companyId: string,
  paths: string[],
  message: string,
  deps = { resolveRoot: defaultResolveRoot, retry: retryCommit }
) {
  try {
    const root = await deps.resolveRoot(companyId)
    return root ? await deps.retry(root, paths, message) : unknown(companyId)
  } catch (err) {
    return crashed(err)
  }
}

// Server action exports (thin; the Impls above are what tests drive).
export async function createDepartmentAction(companyId: string, input: CreateInput) { return createDepartmentActionImpl(companyId, input) }
export async function editDepartmentAction(companyId: string, input: EditInput) { return editDepartmentActionImpl(companyId, input) }
export async function getDepartmentForEditAction(companyId: string, slug: string) { return getDepartmentForEditActionImpl(companyId, slug) }
export async function planRemovalAction(companyId: string, slug: string) { return planRemovalActionImpl(companyId, slug) }
export async function removeDepartmentAction(companyId: string, input: { slug: string; expectedRevision: string; confirm: RemovalPlan }) { return removeDepartmentActionImpl(companyId, input) }
export async function addRecordAction(companyId: string, input: { slug: string; title: string; body: string }) { return addRecordActionImpl(companyId, input) }
export async function retryCommitAction(companyId: string, paths: string[], message: string) { return retryCommitActionImpl(companyId, paths, message) }
