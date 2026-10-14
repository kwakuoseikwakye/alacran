import { NextResponse } from "next/server"
import { z } from "zod"
import { appendInboxCapture } from "@/lib/os/brain/dump"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { refuseNonLocal } from "@/lib/http/local-request"

export const dynamic = "force-dynamic"

const DumpSchema = z.object({
  text: z.string().min(1),
  title: z.string().optional(),
  folder: z.string().regex(/^[a-z0-9-]+$/i).optional().default("inbox"),
  tags: z.array(z.string()).default([]),
  companyId: z.string().optional(),
})

/**
 * Where a capture lands is resolved from the registry, never from the body.
 *
 * `companyRoot` used to be a caller-supplied path, and that made this route an
 * arbitrary-directory write: `appendInboxCapture` does `mkdir -p <root>/notes`
 * and appends the request's own text to `inbox.md` underneath it. Worse than
 * the stray directory is where the text ends up — `notes/` is read back into
 * agent context by `/digest` and `/refresh`, so a body that chose its own root
 * was a way to put instructions in front of this company's agent. The nonced
 * fence covers text this app knows is untrusted; it does not cover the
 * company's own notes, because those are trusted by construction.
 *
 * So the id is the only thing a caller may name, and an id that does not
 * resolve is not a path — the same boundary the terminal route draws around
 * `agentId`.
 */
async function resolveCompanyRoot(companyId: string | undefined): Promise<string> {
  if (!companyId) return process.cwd()
  try {
    const agents = await getEffectiveAgents()
    return agents.find((a) => a.id === companyId)?.rootPath ?? process.cwd()
  } catch {
    return process.cwd()
  }
}

export async function POST(request: Request) {
  const refusal = refuseNonLocal(request)
  if (refusal) return refusal

  const parsed = DumpSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  try {
    const result = appendInboxCapture({
      text: parsed.data.text,
      title: parsed.data.title,
      companyRoot: await resolveCompanyRoot(parsed.data.companyId),
      tags: parsed.data.tags,
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "write failed" },
      { status: 500 }
    )
  }
}
