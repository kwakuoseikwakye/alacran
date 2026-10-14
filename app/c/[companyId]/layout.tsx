import { notFound } from "next/navigation"
import { Shell } from "@/components/os/shell"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"
import { guidePendingCount } from "@/lib/guide/observe"
import { buildCommands } from "@/lib/os/palette-sources"
import { buildShellAssistant } from "@/lib/os/shell-assistant"
import { readVoiceSettingsViewImpl } from "@/lib/voice/settings-impl"
import { resolvePersona } from "@/lib/assistant/resolve-persona"
import { TerminalPersist } from "@/components/terminal-persist"

export const dynamic = "force-dynamic"

/**
 * The company-scoped layout. The root layout only knows the active company from
 * a cookie; a `/c/[companyId]` route knows its own id straight off the URL, so
 * this is where the cockpit shell gets a company it can trust. The root
 * layout's `<Shell rootFallback>` steps aside on these routes.
 *
 * The terminal lives here (not in its own page) so it survives navigation
 * between company pages. TerminalPersist keeps the xterm + pty SSE connection
 * alive and shows/hides based on the current route.
 */
export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const [agents, voice] = await Promise.all([getEffectiveAgents(), readVoiceSettingsViewImpl()])
  const agent = agents.find((a) => a.id === companyId)
  if (!agent) notFound()

  // `readVoiceSettingsViewImpl()` above only ever answers with the machine
  // persona — this route knows which company it's rendering, so it resolves
  // company-first itself rather than teaching settings-impl.ts about
  // company-persona.ts (that back-reference is exactly the cycle removed
  // from those two files; resolve-persona.ts is the one place allowed to
  // know both exist). `notFound()` above is typed `never`, so `agent` is
  // guaranteed here — the `null` fallback is defensive, not reachable.
  const persona = (await resolvePersona(agent?.rootPath ?? null)).persona

  // A stale guide waiting in Approvals counts too: a file read, no scan (see lib/guide/observe.ts).
  const pendingReviews =
    (await listPendingReviews(agents)).filter((p) => p.agentId === companyId).length + (await guidePendingCount(companyId))

  // "agents" in the palette sense (a sub-agent WITHIN a company) has no data
  // source yet — `getEffectiveAgents()` here is the company list, not that.
  // Left empty rather than invented; a later task wires it up once that
  // concept exists.
  const commands = buildCommands({
    companyId,
    companies: agents.map((a) => ({ id: a.id, name: a.name })),
    agents: [],
  })

  // Same read the old full-page /assistant route did (see git history) —
  // moved here now that the stage docks into the shell instead.
  const assistant = buildShellAssistant(agents, voice, persona)

  return (
    <>
      <Shell
        companyId={companyId}
        pendingReviews={pendingReviews}
        commands={commands}
        assistant={assistant}
        companies={agents.map((a) => ({ id: a.id, name: a.name }))}
      />
      <TerminalPersist companyId={companyId} companyName={agent.name} />
      {children}
    </>
  )
}

