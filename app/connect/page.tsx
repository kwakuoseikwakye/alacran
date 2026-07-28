import { getConnectStatus } from "@/lib/connect/connect-actions"
import { ConnectPanel } from "@/components/connect-panel"

export const dynamic = "force-dynamic"

export default async function ConnectPage() {
  const status = await getConnectStatus()

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Connect your tools</h1>
        <p className="text-sm text-muted-foreground">
          Your AI agent and the services your companies work with.
        </p>
      </div>
      <ConnectPanel initialStatus={status} />
    </main>
  )
}
