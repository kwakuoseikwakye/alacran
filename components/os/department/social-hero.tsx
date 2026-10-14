import type { SocialMetrics } from "@/lib/os/departments/metrics"
import type { SocialAccount, SocialSnapshot } from "@/lib/os/schemas/social"

export function SocialHero({
  metrics,
  accounts,
  _snapshots = [],
}: {
  metrics: SocialMetrics
  accounts: SocialAccount[]
  _snapshots?: SocialSnapshot[]
}) {
  const platforms = Object.entries(metrics.platformBreakdown)
  const topPlatform =
    platforms.length > 0
      ? [...platforms].sort((a, b) => b[1].followers - a[1].followers)[0]
      : null

  const avgFollowers =
    metrics.totalAccounts > 0
      ? Math.round(metrics.totalFollowers / metrics.totalAccounts)
      : 0

  return (
    <div className="space-y-6">
      {/* 4 Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Total Followers
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-foreground">
            {metrics.totalFollowers.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Across all tracked channels</p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Tracked Accounts
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-foreground">
            {metrics.totalAccounts}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Configured in records/social</p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Top Platform
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-foreground capitalize">
            {topPlatform ? topPlatform[0] : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {topPlatform ? `${topPlatform[1].followers.toLocaleString()} followers` : "No accounts"}
          </p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Avg Audience
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-foreground">
            {avgFollowers.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Per connected profile</p>
        </div>
      </div>

      {/* Platform Distribution */}
      <div className="p-5 rounded border border-border bg-card/20 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Platform Footprint</h3>
          <span className="text-xs text-muted-foreground font-mono">
            {accounts.length} registered accounts
          </span>
        </div>

        {platforms.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            No social accounts configured in records/social/accounts.yaml yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {platforms.map(([platform, data]) => (
              <div
                key={platform}
                className="p-3 rounded border border-border/60 bg-muted/10 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold capitalize text-foreground">
                    {platform}
                  </span>
                  <a
                    href={data.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-mono text-muted-foreground hover:text-primary transition-colors underline truncate max-w-[140px]"
                  >
                    {data.handle}
                  </a>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Followers</span>
                  <span className="font-bold text-foreground">
                    {data.followers.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
