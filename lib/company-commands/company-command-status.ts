"use server"

import { checkRunLockStatus } from "./run-lock"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"

export async function getCompanyCommandStatus(): Promise<{ running: boolean }> {
  return checkRunLockStatus(COMPANY_COMMANDS_DATA_DIR)
}
