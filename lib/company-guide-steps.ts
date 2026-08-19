import { OPEN_TERMINAL_BLURB } from "@/components/open-terminal-button"
import { GET_STARTED_BLURB, GET_STARTED_RUN_BLURB } from "@/components/get-started-button"
import { MCP_BLURB } from "@/components/mcp-servers-sheet"
import { UPDATE_SKILLS_BLURB } from "@/components/update-skills-button"
import { PORTABLE_AGENT_FILE_BLURB } from "@/components/portable-agent-file-button"
import { ADD_PACK_BLURB } from "@/components/add-pack-button"
import { COMPANY_SETUP_BLURB } from "@/components/company-setup-wizard"
import { BACKUP_BLURB } from "@/components/backup-company-button"
import { OWNERSHIP_BLURB } from "@/components/company-ownership-sheet"
import { AI_EXECUTOR_BLURB } from "@/components/ai-executor-picker"
import { GOOGLE_ACCOUNTS_BLURB } from "@/components/google-accounts-picker"
import { REMOVE_BLURB } from "@/components/remove-company-button"
import { AVATAR_BLURB } from "@/components/agent-avatar-form"

export const SKILLS_POINTER_BLURB =
  "Look for Skills in the top menu whenever you want to run something this company already has."

export type GuideStep = { label: string; blurb: string }

export type CompanyGuideFlags = {
  showOpenTerminalButton?: boolean
  showGetStartedButton?: boolean
  showSetupCompanyButton?: boolean
  showEditCompanyButton?: boolean
  showBackupButton?: boolean
  showOwnershipButton?: boolean
  showAiExecutorPicker?: boolean
  showGoogleAccountsPicker?: boolean
  showMcpButton?: boolean
  showSkillsUpdateButton?: boolean
  showPortableAgentFileButton?: boolean
  showAddPackButton?: boolean
  removable?: boolean
}

/**
 * Builds the guide's step list from the exact same show* flags AgentCard
 * uses to decide what to render, so the guide can never explain a button
 * that isn't actually on the card. Skills and Avatar are unconditional:
 * every command-set company can run something via Skills (v22), and every
 * agent gets an avatar form regardless of kind.
 */
export function buildGuideSteps(flags: CompanyGuideFlags, advanced = true): GuideStep[] {
  return [
    {
      show: flags.showSetupCompanyButton || flags.showEditCompanyButton,
      label: "Set up / edit company info",
      blurb: COMPANY_SETUP_BLURB,
    },
    {
      show: flags.showGetStartedButton,
      label: "Get Started",
      // Same button, genuinely different behaviour per mode.
      blurb: advanced ? GET_STARTED_BLURB : GET_STARTED_RUN_BLURB,
    },
    { show: flags.showOpenTerminalButton, label: "Open in Terminal", blurb: OPEN_TERMINAL_BLURB },
    { show: flags.showMcpButton, label: "Connect tools", blurb: MCP_BLURB },
    { show: flags.showSkillsUpdateButton, label: "Update skills", blurb: UPDATE_SKILLS_BLURB },
    { show: flags.showAddPackButton, label: "Add more skills", blurb: ADD_PACK_BLURB },
    {
      show: flags.showPortableAgentFileButton,
      label: "Let any AI read this company",
      blurb: PORTABLE_AGENT_FILE_BLURB,
    },
    { show: true, label: "Skills", blurb: SKILLS_POINTER_BLURB },
    { show: flags.showBackupButton, label: "Back up to GitHub", blurb: BACKUP_BLURB },
    { show: flags.showOwnershipButton, label: "View ownership", blurb: OWNERSHIP_BLURB },
    { show: flags.showAiExecutorPicker, label: "AI executor", blurb: AI_EXECUTOR_BLURB },
    { show: flags.showGoogleAccountsPicker, label: "Inbox accounts", blurb: GOOGLE_ACCOUNTS_BLURB },
    { show: flags.removable, label: "Remove", blurb: REMOVE_BLURB },
    { show: true, label: "Avatar", blurb: AVATAR_BLURB },
  ]
    .filter((step) => step.show)
    .map(({ label, blurb }) => ({ label, blurb }))
}
