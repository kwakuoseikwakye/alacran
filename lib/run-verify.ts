"use server"

import { runVerifyImpl, runCompanyVerifyImpl } from "./run-verify-impl"
import type { VerifyResult } from "./run-verify-impl"

export async function runVerify(): Promise<VerifyResult> {
  return runVerifyImpl()
}

export async function runCompanyVerify(companyId: string): Promise<VerifyResult> {
  return runCompanyVerifyImpl(companyId)
}
