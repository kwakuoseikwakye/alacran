import { readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { refuseNonLocal } from "@/lib/http/local-request"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { IMAGES_DIR } from "@/lib/content-social/posts"

export const dynamic = "force-dynamic"
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg" }

export async function GET(request: Request): Promise<Response> {
  const refusal = refuseNonLocal(request)
  if (refusal) return refusal
  const url = new URL(request.url)
  const file = url.searchParams.get("file") ?? ""
  const ext = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpg)$/.exec(file)?.[1]
  if (!ext || file.includes("..")) return new Response("Bad file", { status: 400 })
  const agent = (await getEffectiveAgents()).find((a) => a.id === url.searchParams.get("company"))
  if (!agent) return new Response("Unknown company", { status: 404 })
  const dir = await realpath(path.join(agent.rootPath, IMAGES_DIR)).catch(() => null)
  const abs = dir ? await realpath(path.join(dir, file)).catch(() => null) : null
  if (!dir || !abs || path.dirname(abs) !== dir) return new Response("Not found", { status: 404 })
  return new Response(await readFile(abs), { headers: { "content-type": TYPES[ext], "cache-control": "no-store" } })
}
