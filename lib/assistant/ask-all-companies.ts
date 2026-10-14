"use server"

import { askAllCompaniesImpl, type AskAllCompaniesOptions } from "./ask-all-companies-impl"
import type { AskCompanyResult } from "../ask-company-impl"
import type { AiExecutorId } from "../ai-executors"

export type { AskAllCompaniesOptions }

/**
 * A spoken (or typed) question spanning every company on this computer,
 * answered read-only. Nothing is written and nothing needs approval — there is
 * no diff, because there is nothing to change.
 */
export async function askAllCompanies(
  question: string,
  spokenLanguage?: string,
  executorId?: AiExecutorId,
  options?: AskAllCompaniesOptions
): Promise<AskCompanyResult> {
  return askAllCompaniesImpl(
    question,
    spokenLanguage,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    executorId,
    undefined,
    options
  )
}

