"use server"

import { revalidatePath } from "next/cache"
import { promises as fs } from "node:fs"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { gitCommitFile } from "../git-commit-file"
import { isSafeRecommendationFileName, parseRecommendation, updateFrontmatterStatus } from "./recommendations"
import { RECOMMENDATIONS_DIR } from "./audit-finances-command"
import { markSavingsRealizedImpl } from "./mark-savings-realized-impl"

export async function approveRecommendation(
  companyId: string,
  fileName: string
): Promise<{ ok: boolean; message: string }> {
  if (!isSafeRecommendationFileName(fileName)) {
    return { ok: false, message: `Invalid recommendation file: ${fileName}` }
  }
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === companyId)
  if (!agent) return { ok: false, message: "Company not found" }

  const filePath = path.join(agent.rootPath, RECOMMENDATIONS_DIR, fileName)
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    const rec = parseRecommendation(raw, fileName, filePath)
    if (rec?.status === "approved") {
      return { ok: true, message: "Recommendation already approved" }
    }
    const updated = updateFrontmatterStatus(raw, "approved")
    await fs.writeFile(filePath, updated, "utf-8")
    await gitCommitFile({
      rootPath: agent.rootPath,
      filePaths: [path.join(RECOMMENDATIONS_DIR, fileName)],
      commitMessage: `chore(finances): approve recommendation ${fileName}`,
    })
    revalidatePath(`/c/${companyId}/finances`)
    return { ok: true, message: "Recommendation approved" }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to approve" }
  }
}

export async function discardRecommendation(
  companyId: string,
  fileName: string
): Promise<{ ok: boolean; message: string }> {
  if (!isSafeRecommendationFileName(fileName)) {
    return { ok: false, message: `Invalid recommendation file: ${fileName}` }
  }
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === companyId)
  if (!agent) return { ok: false, message: "Company not found" }

  const filePath = path.join(agent.rootPath, RECOMMENDATIONS_DIR, fileName)
  try {
    await fs.unlink(filePath)
    await gitCommitFile({
      rootPath: agent.rootPath,
      filePaths: [path.join(RECOMMENDATIONS_DIR, fileName)],
      commitMessage: `chore(finances): discard recommendation ${fileName}`,
    })
    revalidatePath(`/c/${companyId}/finances`)
    return { ok: true, message: "Recommendation discarded" }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to discard" }
  }
}

export async function markSavingsRealized(
  companyId: string,
  fileName: string,
  savingsMonthly?: number
): Promise<{ ok: boolean; message: string }> {
  try {
    const agents = await getEffectiveAgents()
    const agent = agents.find((a) => a.id === companyId)
    if (!agent) return { ok: false, message: "Company not found" }

    const result = await markSavingsRealizedImpl({
      companyRoot: agent.rootPath,
      fileName,
      savingsMonthly,
      gitCommitFile,
    })

    revalidatePath(`/c/${companyId}/finances`)
    return result
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to mark savings realized" }
  }
}
