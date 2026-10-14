"use client"

import { Check } from "lucide-react"
import { DEPARTMENT_PALETTE } from "@/lib/os/departments/palette"

/** Radio group: the selected swatch carries a tick, so colour is never the only signal. */
export function ColorPicker({ value, onChange, name = "color", ariaLabel = "Department colour", labelledBy }: { value: string; onChange: (hex: string) => void; name?: string; ariaLabel?: string; labelledBy?: string }) {
  return (
    <div role="radiogroup" aria-label={labelledBy ? undefined : ariaLabel} aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {DEPARTMENT_PALETTE.map((c) => {
        const selected = value.toLowerCase() === c.hex
        return (
          <label
            key={c.hex}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-os-border px-2 py-1.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 data-[selected=true]:border-foreground"
            data-selected={selected}
          >
            <input type="radio" name={name} value={c.hex} checked={selected} onChange={() => onChange(c.hex)} className="sr-only" aria-label={c.name} />
            <span aria-hidden className="grid size-5 place-items-center rounded-full text-white" style={{ background: c.hex }}>
              {selected && <Check className="size-3" />}
            </span>
            <span>{c.name}</span>
          </label>
        )
      })}
    </div>
  )
}
