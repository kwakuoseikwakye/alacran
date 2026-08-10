"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { saveMcpServers } from "@/lib/save-mcp-servers"
import { MCP_PRESETS } from "@/lib/mcp-presets"
// Type-only: lib/mcp-servers-config.ts imports node:fs/promises, and this is a
// "use client" module. `import type` is erased before bundling; a value import
// would drag node:fs into the client bundle and fail the build.
import type { McpServer } from "@/lib/mcp-servers-config"

export const MCP_BLURB =
  "Connect tools like Canva, Figma or Lovable so this company's AI can use them directly, without installing anything. You sign in once in your browser — no keys are kept here."

/**
 * Manages the company's own .mcp.json — Claude Code's project-scope MCP
 * config. Adding a tool here writes the file and nothing else: approving and
 * signing in happen inside a real interactive session, which is what the
 * "Open in Terminal" button already opens. That's why this Sheet ends with an
 * instruction rather than a "Sign in" button.
 */
export function McpServersSheet({
  agentId,
  companyName,
  currentServers,
}: {
  agentId: string
  companyName: string
  currentServers: McpServer[]
}) {
  const [open, setOpen] = useState(false)
  const [servers, setServers] = useState<McpServer[]>(currentServers)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function save(next: McpServer[]): Promise<boolean> {
    const previous = servers
    setServers(next)
    setPending(true)
    setMessage(null)
    const result = await saveMcpServers(agentId, next)
    setPending(false)
    setMessage(result.message)
    setFailed(!result.ok)
    if (!result.ok) {
      setServers(previous)
      return false
    }
    return true
  }

  async function add() {
    if (await save([...servers, { name: name.trim(), url: url.trim() }])) {
      setName("")
      setUrl("")
    }
  }

  const unusedPresets = MCP_PRESETS.filter((preset) => !servers.some((s) => s.name === preset.name))

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
          </SheetHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-4 text-sm">
            <section className="space-y-1.5">
              <h3 className="font-medium">Connected tools</h3>
              {servers.length === 0 ? (
                <p className="text-muted-foreground text-xs">None yet — pick one below.</p>
              ) : (
                <ul className="space-y-1">
                  {servers.map((server) => (
                    <li key={server.name} className="flex min-w-0 items-center gap-2">
                      <span className="w-24 shrink-0 truncate">{server.name}</span>
                      <code className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs">
                        {server.url}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => void save(servers.filter((s) => s.name !== server.name))}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-1.5">
              <h3 className="font-medium">Add a tool</h3>
              {unusedPresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {unusedPresets.map((preset) => (
                    <Button
                      key={preset.name}
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        setName(preset.name)
                        setUrl(preset.url)
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              )}
              <div className="space-y-1.5 pt-1">
                {/* "e.g." matters here: a bare realistic URL as a placeholder
                    reads as an already-filled value at a glance — it fooled a
                    reviewer during this slice's own live pass. */}
                <label className="text-muted-foreground block space-y-1 text-xs">
                  <span>Name</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. canva" />
                </label>
                <label className="text-muted-foreground block space-y-1 text-xs">
                  <span>Address</span>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="e.g. https://mcp.canva.com/mcp"
                  />
                </label>
                <Button size="sm" disabled={pending || !name.trim() || !url.trim()} onClick={() => void add()}>
                  {pending ? "Saving…" : "Add"}
                </Button>
              </div>
            </section>

            {message && <p className={failed ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>{message}</p>}

            <section className="space-y-1.5">
              <h3 className="font-medium">Signing in</h3>
              <p className="text-muted-foreground text-xs">
                Click <strong>Open in Terminal</strong> on this company&apos;s card. Claude Code will ask you to approve
                the tool the first time — say yes, then type <code className="font-mono">/mcp</code> and pick the tool
                to sign in with your browser. You only do this once per tool.
              </p>
              <p className="text-muted-foreground text-xs">
                These tools are available in <strong>Open in Terminal</strong> and <strong>Get Started</strong>{" "}
                sessions. They are deliberately not available to the commands on the Skills page, which run on their
                own fixed, narrow permissions.
              </p>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
