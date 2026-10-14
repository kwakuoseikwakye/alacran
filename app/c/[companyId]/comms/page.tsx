import type { ComponentType } from "react"
import { ExecutorGapNote } from "@/components/executor-gap-note"
import Link from "next/link"
import { notFound } from "next/navigation"
import { BookOpen, Hash, Mail, MessageCircle, MessagesSquare } from "lucide-react"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { listInquiries } from "@/lib/comms/inquiries"
import { readReplyLog, type ReplyLog } from "@/lib/comms/reply-log"
import { readComms } from "@/lib/os/comms/read"
import { resolveDepartmentConnectors } from "@/lib/os/departments/connectors"
import { FindRepliesForm } from "@/components/comms/find-replies-form"
import { InquiryList } from "@/components/comms/inquiry-list"

export const dynamic = "force-dynamic"

const TOOLS: Record<string, { description: string; icon: ComponentType<{ className?: string }> }> = {
  beeper: { description: "Every chat network in one inbox", icon: MessagesSquare },
  whatsapp: { description: "Customer and team chats", icon: MessageCircle },
  slack: { description: "Team and shared channels", icon: Hash },
  notion: { description: "Pages and comments", icon: BookOpen },
  email: { description: "Connected Google accounts", icon: Mail },
}

const H2 = "text-sm font-semibold tracking-wider uppercase text-muted-foreground"

export default async function CommsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === companyId)
  if (!agent) notFound()

  const [inquiries, logResult, sweeps, connectors] = await Promise.all([
    listInquiries(agent.rootPath),
    readReplyLog(agent.rootPath).then(
      (log): { log: ReplyLog | null; error: string | null } => ({ log, error: null }),
      (err: unknown) => ({ log: null, error: err instanceof Error ? err.message : String(err) })
    ),
    readComms(agent.rootPath),
    resolveDepartmentConnectors(
      [
        { id: "beeper", label: "Beeper" },
        { id: "whatsapp", label: "WhatsApp" },
        { id: "slack", label: "Slack" },
        { id: "notion", label: "Notion" },
        { id: "email", label: "Email" },
      ],
      { companyPath: agent.rootPath }
    ),
  ])

  const waiting = inquiries.filter((i) => i.status === "pending")
  const ready = inquiries.filter((i) => i.status === "approved")
  const recent = [...(logResult.log?.records ?? [])]
    .sort((a, b) => String(b.replied_at).localeCompare(String(a.replied_at)))
    .slice(0, 10)

  return (
    <main className="dash-content space-y-8 pb-12" aria-labelledby="comms-title">
      <header>
        <h1 id="comms-title" className="text-3xl font-semibold text-foreground">Messages & inquiries</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alacrán finds who is waiting on you and drafts the reply. You send it yourself — nothing leaves from here.
        </p>
      </header>

      <section aria-labelledby="comms-tools" className="space-y-3">
        <h2 id="comms-tools" className={H2}>Connected tools</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {connectors.map((c) => {
            const def = TOOLS[c.id] ?? { description: "Connector", icon: MessageCircle }
            const Icon = def.icon
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 p-4 rounded-xl border border-os-border bg-os-surface">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-5 w-5 shrink-0 ${c.status === "connected" ? "text-os-accent" : "text-muted-foreground"}`} />
                  <div className="min-w-0">
                    <strong className="block text-sm font-medium text-foreground truncate">{c.label}</strong>
                    <span className="text-xs text-muted-foreground line-clamp-1">{def.description}</span>
                  </div>
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  {c.status === "connected" ? "Ready" : c.status === "error" ? "Error" : "Available"}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="comms-job" className="space-y-3">
        <h2 id="comms-job" className={H2}>Find who needs a reply</h2>
        <FindRepliesForm companyId={agent.id} />
        <ExecutorGapNote agentId={agent.id} need="outside-text" />
      </section>

      <section aria-labelledby="comms-waiting" className="space-y-3">
        <h2 id="comms-waiting" className={H2}>Waiting for you {waiting.length > 0 && `(${waiting.length})`}</h2>
        <InquiryList inquiries={waiting} companyId={agent.id} empty="Nothing waiting. Run the job above after your chat and email checks." />
      </section>

      <section aria-labelledby="comms-ready" className="space-y-3">
        <h2 id="comms-ready" className={H2}>Ready to reply {ready.length > 0 && `(${ready.length})`}</h2>
        <InquiryList inquiries={ready} companyId={agent.id} empty="Approved replies appear here, ready to copy into the real chat or inbox." />
      </section>

      <section aria-labelledby="comms-memory" className="space-y-3">
        <h2 id="comms-memory" className={H2}>What Alacrán remembers</h2>
        <div className="rounded-xl border border-os-border bg-os-surface p-5 text-sm space-y-4">
          {logResult.error ? (
            <p className="text-destructive text-xs">{logResult.error}</p>
          ) : recent.length === 0 ? (
            <p className="text-muted-foreground italic">Replies you mark as sent are remembered here.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{logResult.log?.replied_count} replies logged</p>
              <ul className="divide-y divide-os-border/50">
                {recent.map((r) => (
                  <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate">
                      <strong className="text-foreground font-medium">{r.from}</strong>
                      <span className="text-muted-foreground ml-2">{r.subject}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0">{r.channel} · {String(r.replied_at).slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {sweeps.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Latest checks</p>
              <ul className="text-xs space-y-0.5">
                {sweeps.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link href={`/c/${agent.id}/files?path=${s.path}`} className="text-os-accent hover:underline">{s.path}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="pt-2 flex items-center justify-between border-t border-os-border/60 text-xs">
            <span className="text-muted-foreground">Reply log: records/comms/inquiries.yaml</span>
            <Link href={`/c/${agent.id}/files?path=records/comms`} className="text-os-accent hover:underline">Inspect raw files →</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
