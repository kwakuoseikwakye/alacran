"use server"

import { revalidatePath } from "next/cache"
import { promises as fs } from "node:fs"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { gitCommitFile, type ExecFileFn } from "../git-commit-file"
import { defaultExecFile } from "../default-exec-file"
import { INQUIRIES_DIR } from "./paths"
import { isSafeInquiryFileName, parseInquiry, updateFrontmatterStatus } from "./inquiries"
import { markRepliedImpl } from "./mark-replied-impl"

type Result = { ok: boolean; message: string }

async function companyRoot(companyId: string): Promise<string | null> {
  const agents = await getEffectiveAgents()
  return agents.find((a) => a.id === companyId)?.rootPath ?? null
}

// Cards the find-replies job writes are plain files on disk, never
// `git add`ed — committing them is a separate, untrusted-input decision, not
// this action's job. `git add` on an untracked path exits 128, so discard
// must know which case it's in before it touches git at all.
async function isTrackedInGit(root: string, relativePath: string, execFn: ExecFileFn = defaultExecFile): Promise<boolean> {
  try {
    await execFn("git", ["-C", root, "ls-files", "--error-unmatch", "--", relativePath])
    return true
  } catch {
    return false
  }
}

export async function approveInquiry(companyId: string, fileName: string): Promise<Result> {
  if (!isSafeInquiryFileName(fileName)) return { ok: false, message: `Invalid inquiry file: ${fileName}` }
  const root = await companyRoot(companyId)
  if (!root) return { ok: false, message: "Company not found" }
  const filePath = path.join(root, INQUIRIES_DIR, fileName)
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    if (parseInquiry(raw, fileName)?.status === "approved") return { ok: true, message: "Already approved" }
    await fs.writeFile(filePath, updateFrontmatterStatus(raw, "approved"), "utf-8")
    await gitCommitFile({
      rootPath: root,
      filePaths: [path.join(INQUIRIES_DIR, fileName)],
      commitMessage: `chore(comms): approve reply ${fileName}`,
    })
    revalidatePath(`/c/${companyId}/comms`)
    return { ok: true, message: "Approved" }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to approve" }
  }
}

export async function discardInquiry(companyId: string, fileName: string): Promise<Result> {
  if (!isSafeInquiryFileName(fileName)) return { ok: false, message: `Invalid inquiry file: ${fileName}` }
  const root = await companyRoot(companyId)
  if (!root) return { ok: false, message: "Company not found" }
  const relativePath = path.join(INQUIRIES_DIR, fileName)
  try {
    const tracked = await isTrackedInGit(root, relativePath)
    await fs.unlink(path.join(root, relativePath))
    if (tracked) {
      await gitCommitFile({
        rootPath: root,
        filePaths: [relativePath],
        commitMessage: `chore(comms): discard inquiry ${fileName}`,
      })
    }
    revalidatePath(`/c/${companyId}/comms`)
    return { ok: true, message: "Discarded" }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to discard" }
  }
}

export async function markReplied(companyId: string, fileName: string): Promise<Result> {
  try {
    const root = await companyRoot(companyId)
    if (!root) return { ok: false, message: "Company not found" }
    const result = await markRepliedImpl({ companyRoot: root, fileName, gitCommitFile })
    revalidatePath(`/c/${companyId}/comms`)
    return result
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to mark replied" }
  }
}
