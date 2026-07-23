"use server"

import { runCompanyCommandImpl } from "./run-company-command-impl"

export async function runCompanyCommand(
  commandId: string,
  fieldValues: Record<string, string>
): Promise<{ started: boolean; message: string }> {
  return runCompanyCommandImpl(commandId, fieldValues)
}
