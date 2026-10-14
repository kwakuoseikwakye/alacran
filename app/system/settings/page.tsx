import { SettingsPanel } from "@/components/settings-panel"
import { APP_VERSION } from "@/lib/app-version"
import { canAutoUpdate } from "@/lib/updates/can-auto-update"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { isAssistantCompany } from "@/lib/assistant/gather-all-companies"
import { readVoiceSettingsViewImpl } from "@/lib/voice/settings-impl"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  // The VIEW, never the settings themselves: it carries `hasKey`, not the key.
  // A secret rendered into the DOM is a secret in every screenshot.
  const voice = await readVoiceSettingsViewImpl()
  const agents = await getEffectiveAgents()

  return (
    <>
      <header className="dash-topbar a-rise">
        <div>
          <h1>Preferences</h1>
          <p>Choose how Alacrán looks, sounds, and works on this computer.</p>
        </div>
      </header>
      <div className="dash-content">
        {/* Same platform gate update-banner.tsx uses — see can-auto-update.ts. */}
        <SettingsPanel
          currentVersion={APP_VERSION}
          canAutoUpdate={canAutoUpdate()}
          voiceProviderId={voice.providerId}
          voiceHasKey={voice.hasKey}
          elevenlabsAgentReady={voice.elevenlabsAgentReady}
          elevenlabsAgentOutdated={voice.elevenlabsAgentOutdated}
          elevenlabsVoiceId={voice.elevenlabsVoiceId}
          persona={voice.persona}
          assistantExecutorId={voice.assistantExecutorId}
          companies={agents.filter(isAssistantCompany).map((a) => ({ id: a.id, name: a.name }))}
          autoDispatchCompanies={voice.autoDispatchCompanies}
        />
      </div>
    </>
  )
}
