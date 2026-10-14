import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { readSocialAccounts, readSocialSnapshots, readContentItems } from "@/lib/os/records/read"
import { resolveDepartmentConnectors } from "@/lib/os/departments/connectors"
import { buildSocialViewModel } from "@/lib/os/departments/adapters/social-adapter"
import { SocialCockpit } from "@/components/os/social/social-cockpit"

export const dynamic = "force-dynamic"

export default async function SocialPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params

  const allAgents = await getEffectiveAgents()
  const agent = allAgents.find((a) => a.id === companyId)
  if (!agent) notFound()

  const [accountsResult, snapshotsResult, contentItemsResult, connectors] = await Promise.all([
    readSocialAccounts(agent.rootPath),
    readSocialSnapshots(agent.rootPath),
    readContentItems(agent.rootPath),
    resolveDepartmentConnectors(
      [
        { id: "x", label: "X (Twitter)" },
        { id: "linkedin", label: "LinkedIn" },
        { id: "youtube", label: "YouTube" },
        { id: "bluesky", label: "Bluesky" },
      ],
      { companyPath: agent.rootPath }
    ),
  ])

  const model = buildSocialViewModel({
    accounts: accountsResult.records,
    snapshots: snapshotsResult.records,
    connectors,
    contentItems: contentItemsResult.records,
  })

  // Staged drafts awaiting §6 Publication Gate sign-off
  const drafts = contentItemsResult.records
    .filter((item) => item.status === "draft" || item.status === "review")
    .map((item) => ({
      id: item.id,
      title: item.title,
      channel: item.channel,
      author: item.author,
      status: item.status,
      type: item.type,
      summary: item.summary,
      publish_date: item.publish_date,
      url: item.url,
    }))

  return (
    <SocialCockpit
      model={model}
      companyId={companyId}
      publicationGateNotice={true}
      drafts={drafts}
    />
  )
}

