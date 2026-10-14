import { departmentRoom } from "@/lib/os/office/rooms"

/** What the room's sign will look like in the Home office (same glyph rule as the 3D sign). */
export function OfficeSign({ slug, name, color }: { slug: string; name: string; color: string }) {
  const room = departmentRoom({ slug, name: name || "Department", color, recordsCount: 1 })
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-os-border bg-os-surface px-3 py-2" aria-label={`Office sign preview: ${room.name}`} role="img">
      <span aria-hidden className="grid size-8 place-items-center rounded-md text-sm font-semibold text-white" style={{ background: color }}>{room.glyph}</span>
      <span className="text-sm font-medium">{room.name}</span>
    </div>
  )
}
