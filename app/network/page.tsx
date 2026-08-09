import Link from "next/link"
import { buildNetworkMap } from "@/lib/build-network-map"
import { getAvatars } from "@/lib/avatars-registry"
import { NetworkGraph } from "@/components/network-graph"

export const dynamic = "force-dynamic"

export default async function NetworkPage() {
  const [data, avatars] = await Promise.all([buildNetworkMap(), getAvatars()])
  const avatarByAgentId = Object.fromEntries(avatars.map((a) => [a.agentId, a.imageUrl]))

  return (
    <>
      <header className="dash-topbar a-rise">
        <div>
          <p className="eyebrow">Your machine</p>
          <h1>Network</h1>
          <p>Every company on this computer, and exactly what it&apos;s actually plugged into.</p>
        </div>
      </header>
      <div className="dash-content">
        {data.companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No companies yet.{" "}
            <Link href="/" className="text-primary underline-offset-4 hover:underline">
              Add one from Agents
            </Link>{" "}
            to see its connections here.
          </p>
        ) : (
          <NetworkGraph data={data} avatarByAgentId={avatarByAgentId} />
        )}
      </div>
    </>
  )
}
