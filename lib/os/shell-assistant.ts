import type { Agent } from "@/lib/adapters/types"
import { isAssistantCompany } from "@/lib/assistant/gather-all-companies"
import type { AssistantPersona } from "@/lib/assistant/persona"
import { getVoiceProvider } from "@/lib/voice/providers"
import type { VoiceSettingsView } from "@/lib/voice/settings-impl"
import type { ShellAssistantData } from "@/components/os/shell"

/**
 * The one place the dock's data is built, shared by the root layout and the
 * company layout so a field cannot be added to one and forgotten in the other.
 */
export function buildShellAssistant(
  agents: Agent[],
  voice: VoiceSettingsView,
  persona: AssistantPersona | null
): ShellAssistantData {
  const provider = getVoiceProvider(voice.providerId)
  return {
    companies: agents.filter(isAssistantCompany).map(({ id, name }) => ({ id, name })),
    voiceProviderId: provider.id,
    voiceReady: !provider.needsKey || voice.hasKey,
    persona,
    initialExecutorId: voice.assistantExecutorId,
    elevenlabsAgentReady: voice.elevenlabsAgentReady,
    autoDispatchCompanies: voice.autoDispatchCompanies,
  }
}
