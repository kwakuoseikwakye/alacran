"use server"

import { revalidatePath } from "next/cache"
import { getEffectiveAgents } from "../../get-effective-agents"
import {
  appendLead,
  appendTransaction,
  appendContentItem,
  appendMilestone,
  updateLeadStage,
  updateTransactionStatus,
  updateContentStage,
  type CreateLeadInput,
  type CreateTransactionInput,
  type CreateContentItemInput,
  type CreateMilestoneInput,
} from "./write"
import type { LeadStage } from "../schemas/funnel"
import type { TransactionStatus } from "../schemas/finances"
import type { ContentStatus } from "../schemas/content"

async function defaultResolveCompanyRoot(companyId: string): Promise<string | null> {
  const agents = await getEffectiveAgents()
  const found = agents.find((a) => a.id === companyId)
  return found?.rootPath ?? null
}

export type CreateRecordResponse =
  | { ok: true; id: string }
  | { ok: false; error: string }

export type UpdateRecordResponse =
  | { ok: true }
  | { ok: false; error: string }

export type ActionResponse =
  | { ok: true; id?: string }
  | { ok: false; error: string }

export async function createLeadActionImpl(
  companyId: string,
  input: CreateLeadInput,
  deps = {
    resolveRoot: defaultResolveCompanyRoot,
    appendLead,
    revalidate: revalidatePath,
  }
): Promise<CreateRecordResponse> {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return { ok: false, error: `Company not found: ${companyId}` }

    const res = await deps.appendLead(root, input)
    if (!res.ok) return { ok: false, error: res.error }

    deps.revalidate(`/c/${companyId}/funnel`)
    deps.revalidate(`/c/${companyId}/dashboard`)
    return { ok: true, id: res.record.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateLeadStageActionImpl(
  companyId: string,
  leadId: string,
  stage: LeadStage,
  deps = {
    resolveRoot: defaultResolveCompanyRoot,
    updateLeadStage,
    revalidate: revalidatePath,
  }
): Promise<UpdateRecordResponse> {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return { ok: false, error: `Company not found: ${companyId}` }

    const res = await deps.updateLeadStage(root, leadId, stage)
    if (!res.ok) return { ok: false, error: res.error }

    deps.revalidate(`/c/${companyId}/funnel`)
    deps.revalidate(`/c/${companyId}/dashboard`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createTransactionActionImpl(
  companyId: string,
  input: CreateTransactionInput,
  deps = {
    resolveRoot: defaultResolveCompanyRoot,
    appendTransaction,
    revalidate: revalidatePath,
  }
): Promise<CreateRecordResponse> {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return { ok: false, error: `Company not found: ${companyId}` }

    const res = await deps.appendTransaction(root, input)
    if (!res.ok) return { ok: false, error: res.error }

    deps.revalidate(`/c/${companyId}/finances`)
    deps.revalidate(`/c/${companyId}/dashboard`)
    return { ok: true, id: res.record.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateTransactionStatusActionImpl(
  companyId: string,
  txnId: string,
  status: TransactionStatus,
  deps = {
    resolveRoot: defaultResolveCompanyRoot,
    updateTransactionStatus,
    revalidate: revalidatePath,
  }
): Promise<UpdateRecordResponse> {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return { ok: false, error: `Company not found: ${companyId}` }

    const res = await deps.updateTransactionStatus(root, txnId, status)
    if (!res.ok) return { ok: false, error: res.error }

    deps.revalidate(`/c/${companyId}/finances`)
    deps.revalidate(`/c/${companyId}/dashboard`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createContentItemActionImpl(
  companyId: string,
  input: CreateContentItemInput,
  deps = {
    resolveRoot: defaultResolveCompanyRoot,
    appendContentItem,
    revalidate: revalidatePath,
  }
): Promise<CreateRecordResponse> {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return { ok: false, error: `Company not found: ${companyId}` }

    const res = await deps.appendContentItem(root, input)
    if (!res.ok) return { ok: false, error: res.error }

    deps.revalidate(`/c/${companyId}/content`)
    deps.revalidate(`/c/${companyId}/dashboard`)
    return { ok: true, id: res.record.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateContentStageActionImpl(
  companyId: string,
  itemId: string,
  status: ContentStatus,
  deps = {
    resolveRoot: defaultResolveCompanyRoot,
    updateContentStage,
    revalidate: revalidatePath,
  }
): Promise<UpdateRecordResponse> {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return { ok: false, error: `Company not found: ${companyId}` }

    const res = await deps.updateContentStage(root, itemId, status)
    if (!res.ok) return { ok: false, error: res.error }

    deps.revalidate(`/c/${companyId}/content`)
    deps.revalidate(`/c/${companyId}/dashboard`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Server action exports
export async function createLeadAction(
  companyId: string,
  input: CreateLeadInput
): Promise<CreateRecordResponse> {
  try {
    return await createLeadActionImpl(companyId, input)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateLeadStageAction(
  companyId: string,
  leadId: string,
  stage: LeadStage
): Promise<UpdateRecordResponse> {
  try {
    return await updateLeadStageActionImpl(companyId, leadId, stage)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createTransactionAction(
  companyId: string,
  input: CreateTransactionInput
): Promise<CreateRecordResponse> {
  try {
    return await createTransactionActionImpl(companyId, input)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateTransactionStatusAction(
  companyId: string,
  txnId: string,
  status: TransactionStatus
): Promise<UpdateRecordResponse> {
  try {
    return await updateTransactionStatusActionImpl(companyId, txnId, status)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createContentItemAction(
  companyId: string,
  input: CreateContentItemInput
): Promise<CreateRecordResponse> {
  try {
    return await createContentItemActionImpl(companyId, input)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateContentStageAction(
  companyId: string,
  itemId: string,
  status: ContentStatus
): Promise<UpdateRecordResponse> {
  try {
    return await updateContentStageActionImpl(companyId, itemId, status)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createMilestoneActionImpl(
  companyId: string,
  input: CreateMilestoneInput,
  deps = {
    resolveRoot: defaultResolveCompanyRoot,
    appendMilestone,
    revalidate: revalidatePath,
  }
): Promise<CreateRecordResponse> {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return { ok: false, error: `Company not found: ${companyId}` }

    const res = await deps.appendMilestone(root, input)
    if (!res.ok) return { ok: false, error: res.error }

    deps.revalidate(`/c/${companyId}/roadmap`)
    return { ok: true, id: res.record.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createMilestoneAction(
  companyId: string,
  input: CreateMilestoneInput
): Promise<CreateRecordResponse> {
  try {
    return await createMilestoneActionImpl(companyId, input)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
