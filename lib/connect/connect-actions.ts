"use server"

import { getConnectStatusImpl } from "./connect-status-impl"
import type { ConnectStatus } from "./connect-status-impl"

export async function getConnectStatus(): Promise<ConnectStatus> {
  return getConnectStatusImpl()
}
