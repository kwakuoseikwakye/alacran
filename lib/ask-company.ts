"use server"

import { askCompanyImpl, type AskCompanyResult } from "./ask-company-impl"
import type { AiExecutorId } from "./ai-executors"

/**
 * A spoken (or typed) question about this company, answered read-only by its
 * own configured AI. Nothing is written and nothing needs approval — there is
 * no diff, because there is nothing to change.
 */
export async function askCompany(
  agentId: string,
  question: string,
  spokenLanguage?: string,
  executorId?: AiExecutorId,
  options?: { fast?: boolean }
): Promise<AskCompanyResult> {
  return askCompanyImpl(
    agentId,
    question,
    spokenLanguage,
    undefined,
    undefined,
    undefined,
    undefined,
    executorId,
    undefined,
    undefined,
    undefined,
    options
  )
}
