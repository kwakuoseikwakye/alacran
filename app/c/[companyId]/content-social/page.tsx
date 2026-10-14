import path from "node:path"
import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { getAgentCardFlags } from "@/lib/agent-card-flags"
import { resolveAiExecutorForAgent } from "@/lib/ai-executor-registry"
import { COMPANY_COMMANDS_DATA_DIR } from "@/lib/company-commands/paths"
import { listPosts } from "@/lib/content-social/posts"
import { CANVA_DESIGN_TOOLS, CANVA_SERVER_NAME } from "@/lib/content-social/canva-tools"
import { McpServersSheet } from "@/components/mcp-servers-sheet"
import { MakePostsForm } from "@/components/content-social/make-posts-form"
import { PostList } from "@/components/content-social/post-list"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function ContentSocialPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === companyId)
  if (!agent) notFound()

  const [flags, executor, posts] = await Promise.all([
    getAgentCardFlags(agent, agents.some((a) => a.id === "plh-ops")),
    resolveAiExecutorForAgent(agent.id),
    listPosts(agent.rootPath, path.join(COMPANY_COMMANDS_DATA_DIR, agent.id, "make-posts.run.json")),
  ])
  const canvaWanted = CANVA_DESIGN_TOOLS.length > 0
  const canvaConnected = Boolean(flags.mcpServers?.some((s) => s.name === CANVA_SERVER_NAME))
  const waiting = posts.filter((p) => p.state === "waiting")
  const ready = posts.filter((p) => p.state === "ready")
  const posted = posts.filter((p) => p.state === "posted").reverse()

  return (
    <main className="dash-content content-social" aria-labelledby="cs-title">
      <header><h1 id="cs-title">Content & social</h1><p>{canvaWanted ? "Alacrán drafts your posts and designs them in your Canva. Nothing is posted without you." : "Alacrán drafts your posts for you to approve. Nothing is posted without you."}</p></header>

      <section aria-labelledby="cs-tools"><h2 id="cs-tools">Connected tools</h2>
        {canvaWanted ? (
          <div className="cs-tool">
            <strong>Canva</strong> <span>{canvaConnected ? "Connected" : "Not connected"}</span>
            {flags.showMcpButton && <McpServersSheet agentId={agent.id} companyName={agent.name} pool={flags.mcpPool ?? []} currentServers={flags.mcpServers ?? []} />}
          </div>
        ) : <p>For now you make the picture yourself: each post has an Open in Canva button that copies the caption for you.</p>}
      </section>

      <section aria-labelledby="cs-jobs"><h2 id="cs-jobs">Make posts</h2>
        {!executor.enforcesToolScope || (canvaWanted && !executor.supportsMcpToolAllowlist) ? (
          <p>Make posts needs Claude Code for now. <Link href={`/c/${agent.id}/agents#ai`}>Choose it under Your AI</Link>.</p>
        ) : canvaWanted && !canvaConnected ? (
          <p>Connect Canva above first, so Alacrán can make the images.</p>
        ) : <MakePostsForm agentId={agent.id} />}
      </section>

      <section aria-labelledby="cs-waiting"><h2 id="cs-waiting">Waiting for you</h2>
        <PostList posts={waiting} agentId={agent.id} empty="Nothing waiting. Posts you ask for appear here to approve." />
      </section>

      <section aria-labelledby="cs-ready"><h2 id="cs-ready">Ready to post</h2>
        <PostList posts={ready} agentId={agent.id} empty="Approved posts appear here, ready to copy and post." />
      </section>

      <section aria-labelledby="cs-memory"><h2 id="cs-memory">What Alacrán remembers</h2>
        {posted.length === 0 ? <p>Posts you mark as posted are remembered here, and Alacrán uses them to match your voice.</p> : (
          <ul>{posted.map((p) => <li key={p.fileName}>{p.title}{p.postedOn ? ` · posted ${p.postedOn}` : ""}</li>)}</ul>
        )}
        <p><Link href={`/c/${agent.id}/content`}>See your full content list</Link></p>
      </section>
    </main>
  )
}
