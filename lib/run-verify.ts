"use server"

import { runVerifyImpl } from "./run-verify-impl"
import type { VerifyResult } from "./run-verify-impl"

export async function runVerify(): Promise<VerifyResult> {
  return runVerifyImpl()
}
