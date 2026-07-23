import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"

export type AvatarEntry = { agentId: string; imageUrl: string }

const DEFAULT_REGISTRY_PATH = path.join(process.cwd(), ".data", "avatars.json")

export async function getAvatars(registryPath: string = DEFAULT_REGISTRY_PATH): Promise<AvatarEntry[]> {
  let raw: string
  try {
    raw = await readFile(registryPath, "utf-8")
  } catch {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function hasAllowedScheme(imageUrl: string): boolean {
  return imageUrl.startsWith("https://") || imageUrl.startsWith("http://") || imageUrl.startsWith("data:image/")
}

export async function setAvatarImpl(
  agentId: string,
  imageUrl: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  if (!agents.some((a) => a.id === agentId)) {
    return { ok: false, message: "Unknown agent" }
  }
  if (!hasAllowedScheme(imageUrl)) {
    return { ok: false, message: "Image URL must start with https://, http://, or data:image/" }
  }

  const avatars = await getAvatars(registryPath)
  const withoutExisting = avatars.filter((a) => a.agentId !== agentId)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(registryPath, JSON.stringify([...withoutExisting, { agentId, imageUrl }], null, 2), "utf-8")
  return { ok: true }
}

export async function removeAvatarImpl(
  agentId: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  const avatars = await getAvatars(registryPath)
  if (!avatars.some((a) => a.agentId === agentId)) {
    return { ok: false, message: "Not found" }
  }
  const remaining = avatars.filter((a) => a.agentId !== agentId)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(registryPath, JSON.stringify(remaining, null, 2), "utf-8")
  return { ok: true }
}
