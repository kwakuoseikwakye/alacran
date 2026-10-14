"use client"

import { ExecutorGapNote } from "@/components/executor-gap-note"
import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { saveMcpServers } from "@/lib/save-mcp-servers"
// Type-only: lib/mcp-servers-config.ts imports node:fs/promises, and this is a
// "use client" module. `import type` is erased before bundling; a value import
// would drag node:fs into the client bundle and fail the build.
import type { McpServer } from "@/lib/mcp-servers-config"

export const MCP_BLURB =
  "Tick the tools this company's AI may use — Canva, Figma, Lovable and anything else added on the Connections page. Ticking one is step one of two: it doesn't work until you approve it and sign in, which takes about a minute in Open in Terminal. No keys are kept here."

/**
 * Picks, from the machine's pool of known MCP servers, the ones THIS company
 * uses — writing its own .mcp.json (and Kiro's copy, via saveMcpServers).
 *
 * It used to be an add-a-server form, which meant the same name and URL were
 * retyped for every company that wanted the same tool, and the only place a
 * tool existed was inside one company. Adding a *new* server is Connections'
 * job now; this page only ever picks from what is already there, which is why
 * an empty pool links one way and offers no form.
 *
 * Signing in still happens inside a real interactive session — the "Open in
 * Terminal" button — which is why this Sheet ends with an instruction rather
 * than a "Sign in" button.
 */
export function McpServersSheet({
  agentId,
  companyName,
  pool,
  currentServers,
}: {
  agentId: string
  companyName: string
  /** Every MCP server this machine knows about (lib/mcp-pool.ts). */
  pool: McpServer[]
  /** The ones already in this company's .mcp.json. */
  currentServers: McpServer[]
}) {
  const [open, setOpen] = useState(false)
  const [servers, setServers] = useState<McpServer[]>(currentServers)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  // Anything this company already uses that isn't in the pool — a server
  // added by hand with `claude mcp add`, say — still gets a row. Hiding a
  // tool that is genuinely in use, and removing the only control that could
  // turn it off, is the one thing this rewrite must not do.
  const rows = [...pool, ...servers.filter((s) => !pool.some((p) => p.name === s.name))]

  async function toggle(server: McpServer) {
    const previous = servers
    const isOn = servers.some((s) => s.name === server.name)
    const next = isOn ? servers.filter((s) => s.name !== server.name) : [...servers, server]
    setServers(next)
    setPending(true)
    setMessage(null)
    setJustAdded(null)
    const result = await saveMcpServers(agentId, next)
    setPending(false)
    setMessage(result.message)
    setFailed(!result.ok)
    if (!result.ok) {
      setServers(previous)
      return
    }
    // The approval step is the one users miss, so it is stated at the moment
    // they act rather than only in the section below.
    if (!isOn) setJustAdded(server.name)
  }

  return (
    <>
      <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        Connect tools
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Tools {companyName} can use</SheetTitle>
            <SheetDescription>{MCP_BLURB}</SheetDescription>
            <ExecutorGapNote agentId={agentId} need="mcp-servers" />
          </SheetHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-4 text-sm">
            {justAdded && (
              <div className="border-warning/40 bg-warning/10 space-y-1 rounded-md border px-3 py-2">
                <p className="font-medium">Added {justAdded} — one more step before it works</p>
                <p className="text-muted-foreground text-xs">
                  Click <strong>Open in Terminal</strong> on this card, approve {justAdded} when Claude Code asks, then
                  type <code className="font-mono">/mcp</code> to sign in. Until then the AI can&apos;t use it.
                </p>
              </div>
            )}

            <section className="space-y-1.5">
              <h3 className="font-medium">Tools on this computer</h3>
              {rows.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  None yet. Tools are added once on the{" "}
                  <Link href="/system/connectors" className="text-primary underline-offset-4 hover:underline">
                    Connections
                  </Link>{" "}
                  page, then every company picks from that list.
                </p>
              ) : (
                <ul className="space-y-1">
                  {rows.map((server) => (
                    <li key={server.name} className="flex min-w-0 items-center gap-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={servers.some((s) => s.name === server.name)}
                          disabled={pending}
                          onChange={() => void toggle(server)}
                        />
                        <span className="w-24 shrink-0 truncate">{server.name}</span>
                        <code className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs">
                          {server.url}
                        </code>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-muted-foreground text-xs">
                Need one that isn&apos;t listed? Add it once in{" "}
                <Link href="/system/connectors" className="text-primary underline-offset-4 hover:underline">
                  Connections
                </Link>{" "}
                and it appears here for every company.
              </p>
            </section>

            {/* Suppressed while the just-added banner is up: a bare "Saved"
                next to it reads as "finished", which is the exact wrong
                impression — the tool doesn't work until it's approved. */}
            {message && !justAdded && (
              <p className={failed ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>{message}</p>
            )}

            <section className="space-y-1.5">
              <h3 className="font-medium">Making a tool actually work</h3>
              <p className="text-muted-foreground text-xs">
                Ticking a tool above only writes it down. Every tool needs these two steps once, or the AI can&apos;t
                use it:
              </p>
              <ol className="text-muted-foreground list-decimal space-y-1 pl-4 text-xs">
                <li>
                  Click <strong>Open in Terminal</strong> on this card. Claude Code asks whether you trust the tool the
                  first time — say yes. This is the step people miss.
                </li>
                <li>
                  In that same window, type <code className="font-mono">/mcp</code>, pick the tool, and sign in with
                  your browser.
                </li>
              </ol>
              <p className="text-muted-foreground text-xs">
                These tools are available in <strong>Open in Terminal</strong> and <strong>Get Started</strong>{" "}
                sessions. They are deliberately not available to the commands on the Skills page, which run on their
                own fixed, narrow permissions.
              </p>
              {/* Gmail/Calendar/Drive used to be offered here and could never
                  sign in — see the note in lib/mcp-presets.ts. Anyone who
                  added one still has the dead entry listed above, so say why
                  here rather than only in a changelog. */}
              <p className="text-muted-foreground text-xs">
                <strong>Gmail, Google Calendar and Google Drive don&apos;t work this way.</strong> Google&apos;s sign-in
                won&apos;t accept Claude Code as a tool, so those never get past the sign-in step. Connect Google on the{" "}
                <strong>Connections</strong> page instead. If one is ticked above, untick it — it can&apos;t work.
              </p>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
