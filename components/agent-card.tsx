import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Agent, Activity } from "@/lib/adapters/types"
import type { LaunchdHealth } from "@/lib/adapters/launchd"
import type { PollLockStatus } from "@/lib/adapters/poll-lock"
import { TriggerPollButton } from "@/components/trigger-poll-button"
import { VerifyButton } from "@/components/verify-button"
import { DailyTeamLogButton } from "@/components/daily-team-log-button"
import { RemoveCompanyButton } from "@/components/remove-company-button"
import { AgentAvatar } from "@/components/agent-avatar"
import { AgentAvatarForm } from "@/components/agent-avatar-form"
import { StatusDot } from "@/components/status-dot"
import { CompanySetupWizard } from "@/components/company-setup-wizard"

type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
  pollStatus?: PollLockStatus
  showVerifyButton?: boolean
  showDailyTeamLogButton?: boolean
  removable?: boolean
  avatarUrl?: string | null
  showSetupCompanyButton?: boolean
  integrationStatus: string
}

const KIND_BADGE_CLASS: Record<Agent["kind"], string> = {
  pipeline: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  "command-set": "border-violet-500/30 bg-violet-500/10 text-violet-400",
  "report-log": "border-teal-500/30 bg-teal-500/10 text-teal-400",
}

export function AgentCard({
  agent,
  latestActivity,
  error,
  launchdHealth,
  pollStatus,
  showVerifyButton,
  showDailyTeamLogButton,
  removable,
  avatarUrl,
  showSetupCompanyButton,
  integrationStatus,
}: AgentCardProps) {
  return (
    <Card className="transition-colors hover:border-border/80">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold">
            <AgentAvatar imageUrl={avatarUrl ?? null} />
            {agent.name}
          </span>
          <Badge variant="outline" className={KIND_BADGE_CLASS[agent.kind]}>
            {agent.kind}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error && <p className="text-destructive">Source unavailable: {error}</p>}
        {!error && !latestActivity && <p className="text-muted-foreground">No activity recorded yet.</p>}
        {!error && latestActivity && (
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <StatusDot status={latestActivity.status} />
              {latestActivity.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(latestActivity.timestamp * 1000).toLocaleString()} · {latestActivity.status}
            </p>
          </div>
        )}
        {launchdHealth && (
          <p className="text-xs text-muted-foreground">
            launchd: {launchdHealth.loaded ? "loaded" : "not loaded"}
            {launchdHealth.lastExitStatus !== null && ` (last exit ${launchdHealth.lastExitStatus})`}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Integrations: {integrationStatus}</p>
        <div className="space-y-2 pt-1">
          {pollStatus && <TriggerPollButton pollStatus={pollStatus} />}
          {showVerifyButton && <VerifyButton />}
          {showDailyTeamLogButton && <DailyTeamLogButton />}
          {showSetupCompanyButton && <CompanySetupWizard agentId={agent.id} companyName={agent.name} />}
          {removable && <RemoveCompanyButton id={agent.id} name={agent.name} />}
          <AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} />
        </div>
      </CardContent>
    </Card>
  )
}
