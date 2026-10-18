import { NextResponse } from "next/server"
import { defaultExecFile } from "@/lib/default-exec-file"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { refuseNonLocal } from "@/lib/http/local-request"
import { typeOfPath } from "@/lib/os/brain/memory-graph"

export const dynamic = "force-dynamic"

const SKILL_MD = /^\.(claude|agents)\/(?:[^/]+\/)*[^/]+\.md$/

// Every check runs before git does. The path ends up inside a `HEAD:./<path>`
// argv token, so it must be a plain relative path that cannot climb out of the
// company tree, cannot be read as an option, and is one of the file kinds the
// memory map actually shows.
function isReadablePath(p: string): boolean {
  if (!p || p.startsWith("/") || p.startsWith("-") || p.includes("\\")) return false
  if (/[\x00-\x1f\x7f]/.test(p)) return false
  if (p.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return false
  return typeOfPath(p) !== null || SKILL_MD.test(p)
}

export async function GET(request: Request) {
  const refusal = refuseNonLocal(request)
  if (refusal) return refusal

  const params = new URL(request.url).searchParams
  const companyId = params.get("companyId")
  const path = params.get("path") ?? ""
  if (!companyId || !isReadablePath(path)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 })
  }

  // Root comes from the registry by id only — same boundary as the dump route.
  // No fallback to cwd: an unknown id is not a place to read from.
  let root: string | undefined
  try {
    root = (await getEffectiveAgents()).find((a) => a.id === companyId)?.rootPath
  } catch {
    root = undefined
  }
  if (!root) return NextResponse.json({ error: "not found" }, { status: 404 })

  try {
    // Committed text only, never the working tree; `HEAD:./` stays inside `-C`.
    const { stdout } = await defaultExecFile("git", ["--no-optional-locks", "-C", root, "show", `HEAD:./${path}`])
    return NextResponse.json({ path, text: stdout })
  } catch {
    // git's stderr names the absolute root; don't echo it.
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }
}
