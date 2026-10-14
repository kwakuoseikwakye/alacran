import { getAllCompaniesTerminalStatus } from "@/lib/terminal/sessions"
import { refuseNonLocal } from "@/lib/http/local-request"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const refusal = refuseNonLocal(request)
  if (refusal) return refusal

  const statusByAgent = getAllCompaniesTerminalStatus()
  return Response.json({ statusByAgent })
}
