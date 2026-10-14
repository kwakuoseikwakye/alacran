import { NextResponse } from "next/server"
import path from "node:path"
import { z } from "zod"
import { KEY_SLOTS, listKeyStatuses, upsertEnvLocal } from "@/lib/os/connectors/keys"
import { readEnvLocal } from "@/lib/os/connectors/creds"
import { refuseNonLocal } from "@/lib/http/local-request"

export const dynamic = "force-dynamic"

const ENV_LOCAL = path.join(process.cwd(), ".env.local")

export async function GET(request: Request) {
  const refusal = refuseNonLocal(request)
  if (refusal) return refusal

  // masked statuses only — raw values never cross this boundary
  const merged = { ...process.env, ...readEnvLocal() }
  return NextResponse.json({ keys: listKeyStatuses(merged) })
}

const SetKeySchema = z.object({
  envVar: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string().min(1).max(4096),
})

export async function POST(request: Request) {
  const refusal = refuseNonLocal(request)
  if (refusal) return refusal

  const parsed = SetKeySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { envVar, value } = parsed.data
  if (!KEY_SLOTS.some((s) => s.envVar === envVar)) {
    return NextResponse.json({ error: `unknown key slot: ${envVar}` }, { status: 400 })
  }
  const targetPath =
    process.env.FOUNDER_OS_ENV_LOCAL ?? process.env.ALACRAN_ENV_LOCAL ?? ENV_LOCAL
  upsertEnvLocal(targetPath, envVar, value)
  process.env[envVar] = value // live immediately; .env.local persists across restarts
  return NextResponse.json({ ok: true, envVar })
}
