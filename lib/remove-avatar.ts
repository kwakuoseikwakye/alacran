"use server"

import { removeAvatarImpl } from "./avatars-registry"

export async function removeAvatar(agentId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  return removeAvatarImpl(agentId)
}
