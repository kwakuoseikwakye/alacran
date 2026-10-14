"use client"

import { useEffect, useRef, type RefObject } from "react"
import { createNexusRenderer, type NexusRenderer } from "./nexus-scene"
import type { NexusState, PaletteId } from "@/lib/voice/agent/nexus-model"

/** The Nexus orb. One canvas that fills its positioned parent; the renderer owns the animation loop. */
export function NexusOrb({
  state, palette, paused, highContrast, center, levelRef, binsRef, waveRef, label,
}: {
  state: NexusState
  palette: PaletteId
  paused: boolean
  highContrast: boolean
  center: number
  levelRef: { current: number | null }
  binsRef?: { current: Uint8Array | null }
  waveRef?: RefObject<HTMLCanvasElement | null>
  label: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<NexusRenderer | null>(null)
  const settings = { state, palette, paused, highContrast, center }
  const latest = useRef(settings)
  latest.current = settings

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const r = createNexusRenderer(canvas, { initial: latest.current, levelRef, binsRef, wave: waveRef?.current ?? null })
    rendererRef.current = r
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") r?.resetView() }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      r?.destroy()
      rendererRef.current = null
    }
  }, [levelRef, binsRef, waveRef])

  useEffect(() => {
    rendererRef.current?.set({ state, palette, paused, highContrast, center })
  }, [state, palette, paused, highContrast, center])

  return <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={label} className="nx-scene" />
}
