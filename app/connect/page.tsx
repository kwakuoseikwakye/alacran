import { getConnectStatus } from "@/lib/connect/connect-actions"
import { ConnectPanel } from "@/components/connect-panel"

export const dynamic = "force-dynamic"

export default async function ConnectPage() {
  const status = await getConnectStatus()

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-8 pt-2 pb-12">
      <div className="a-rise">
        <p className="eyebrow">Integrations</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Connect your tools</h1>
        <p className="text-sm text-muted-foreground">
          Your AI agent and the services your companies work with.
        </p>
      </div>
      <ConnectPanel initialStatus={status} />
    </main>
  )
}
