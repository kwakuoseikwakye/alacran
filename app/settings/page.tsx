import { SettingsPanel } from "@/components/settings-panel"
import { APP_VERSION } from "@/lib/app-version"

export const dynamic = "force-dynamic"

export default function SettingsPage() {
  return (
    <>
      <header className="dash-topbar a-rise">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>Settings</h1>
          <p>Appearance, updates, and local preferences for this dashboard.</p>
        </div>
      </header>
      <div className="dash-content">
        {/* Same platform gate update-banner.tsx uses: unsigned macOS builds
            get Gatekeeper-quarantined by a self-install, so only Linux gets
            an in-app "Update & Restart" — everyone else gets a download link. */}
        <SettingsPanel currentVersion={APP_VERSION} canAutoUpdate={process.platform === "linux"} />
      </div>
    </>
  )
}
