"use server"

import { runPreflightChecks, type PreflightReport } from "./preflight"
import { getEffectiveAgents } from "@/lib/get-effective-agents"

/**
 * Server action to run preflight health checks for a company before command dispatch.
 */
export async function runPreflightCheckAction(
  companyId: string,
  commandId?: string
): Promise<PreflightReport> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === companyId)
  if (!agent) {
    return {
      ok: false,
      canProceed: false,
      checks: [
        {
          id: "company-lookup",
          title: "Company Lookup",
          status: "fail",
          blocker: true,
          message: `Unknown company ID "${companyId}"`,
        },
      ],
      blockers: [
        {
          id: "company-lookup",
          title: "Company Lookup",
          status: "fail",
          blocker: true,
          message: `Unknown company ID "${companyId}"`,
        },
      ],
      warnings: [],
    }
  }

  return runPreflightChecks(agent.rootPath, commandId)
}
