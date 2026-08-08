import { getConnectStatus } from "@/lib/connect/connect-actions"
import { ConnectPanel } from "@/components/connect-panel"

export const dynamic = "force-dynamic"

export default async function ConnectPage() {
  const status = await getConnectStatus()

  return (
    <>
      <header className="dash-topbar a-rise">
        <div>
          <p className="eyebrow">Integrations</p>
          <h1>Connect your tools</h1>
          <p>Sign in to the services your companies work with.</p>
        </div>
      </header>
      <div className="dash-content">
        <ConnectPanel initialStatus={status} />
      </div>
    </>
  )
}
