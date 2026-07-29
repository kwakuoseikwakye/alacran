"use server"

import { backupCompanyImpl, getCompanyRemoteImpl } from "./backup-company-impl"
import { restoreCompanyImpl } from "./restore-company-impl"
import type { BackupResult, RemoteResult } from "./backup-company-impl"

export async function getCompanyRemote(agentId: string): Promise<RemoteResult> {
  return getCompanyRemoteImpl(agentId)
}

export async function backupCompany(agentId: string): Promise<BackupResult> {
  return backupCompanyImpl(agentId)
}

export async function restoreCompany(
  name: string,
  cloneUrl: string,
  targetPath: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  return restoreCompanyImpl(name, cloneUrl, targetPath)
}
