"use server"

import { setAvatarImpl } from "./avatars-registry"

export async function setAvatar(agentId: string, imageUrl: string): Promise<{ ok: true } | { ok: false; message: string }> {
  return setAvatarImpl(agentId, imageUrl)
}
