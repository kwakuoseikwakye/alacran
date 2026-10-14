export default function RootLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse select-none min-h-[60vh]">
      <div className="h-2.5 w-24 rounded bg-os-surface2/80" />
      <div className="h-7 w-48 rounded bg-os-surface2" />
      <div className="h-3.5 w-72 rounded bg-os-surface2/40" />
      <div className="rounded-lg border border-os-border/50 bg-os-surface/30 p-8 min-h-[300px] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-os-accent/40 border-t-os-accent animate-spin" />
      </div>
    </div>
  )
}
