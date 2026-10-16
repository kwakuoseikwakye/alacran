"use server"

import { revalidatePath } from "next/cache"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import * as manage from "./manage"

/** Thin server-action wrappers over lib/jobs/manage.ts: resolve the company, never throw, refresh the two pages. */
async function withCompany(companyId: string, fn: (ctx: manage.Ctx) => Promise<manage.Result>): Promise<manage.Result> {
  const agent = (await getEffectiveAgents()).find((a) => a.id === companyId)
  if (!agent) return { ok: false, message: "That company isn't registered here." }
  try {
    return await fn({ companyId, root: agent.rootPath })
  } catch {
    return { ok: false, message: "That didn't work. Check the company folder is a working git repository and try again." }
  } finally {
    revalidatePath(`/c/${companyId}/jobs`)
    revalidatePath(`/c/${companyId}/tasks`)
  }
}

export async function setJobModeAction(companyId: string, jobId: string, mode: "shadow" | "live") {
  return withCompany(companyId, (ctx) => manage.setJobMode(ctx, jobId, mode === "live" ? "live" : "shadow"))
}

export async function setJobEnabledAction(companyId: string, jobId: string, enabled: boolean) {
  return withCompany(companyId, (ctx) => manage.setJobEnabled(ctx, jobId, enabled === true))
}

export async function runJobNowAction(companyId: string, jobId: string) {
  return withCompany(companyId, (ctx) => manage.runNow(ctx, jobId))
}

export async function approvePolicyAction(companyId: string, policyId: string) {
  return withCompany(companyId, (ctx) => manage.approve(ctx, policyId))
}

export async function revokePolicyAction(companyId: string, policyId: string) {
  return withCompany(companyId, (ctx) => manage.revoke(ctx, policyId))
}

export async function sendTestAction(companyId: string, policyId: string, to: string) {
  return withCompany(companyId, (ctx) => manage.test(ctx, policyId, String(to)))
}

export async function markFlagHandledAction(companyId: string, key: string) {
  return withCompany(companyId, (ctx) => manage.markHandled(ctx, String(key)))
}
