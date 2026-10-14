"use client"

import React, { useEffect, useRef } from "react"
import { Mic, Volume2, Loader2 } from "lucide-react"

export type AssistantMode = "idle" | "listening" | "thinking" | "speaking"

export interface HumanoidAvatarProps {
  mode: AssistantMode
  onToggle: () => void
  audioLevelRef?: React.RefObject<number | null>
  frequencyBinsRef?: React.RefObject<Uint8Array | null>
  compact?: boolean
}

const MODE_LABELS: Record<AssistantMode, { title: string; hint: string }> = {
  idle: { title: "Speak", hint: "Tap to talk or hold Spacebar" },
  listening: { title: "Listening...", hint: "Speak now — tap to finish" },
  thinking: { title: "Thinking...", hint: "Consulting company context & files" },
  speaking: { title: "Speaking...", hint: "Tap to pause or mute" },
}

export function HumanoidAvatar({
  mode,
  onToggle,
  audioLevelRef,
  compact = false,
}: HumanoidAvatarProps) {
  const barsRef = useRef<HTMLDivElement[]>([])

  // 60fps audio level binding for the equalizer bars without re-rendering the component
  useEffect(() => {
    let animId: number
    const updateBars = () => {
      const level = audioLevelRef?.current ?? 0
      if (barsRef.current && barsRef.current.length > 0) {
        barsRef.current.forEach((bar, idx) => {
          if (!bar) return
          if (mode === "listening") {
            const spread = Math.sin(idx * 0.8 + Date.now() * 0.008) * 0.3
            const dynamicScale = Math.max(0.2, Math.min(1.8, level * 1.8 + spread + 0.3))
            bar.style.transform = `scaleY(${dynamicScale.toFixed(3)})`
          } else if (mode === "thinking") {
            const wave = Math.sin(idx * 0.6 - Date.now() * 0.006) * 0.5 + 0.6
            bar.style.transform = `scaleY(${Math.max(0.2, wave).toFixed(3)})`
          } else if (mode === "speaking") {
            const wave = Math.abs(Math.sin(idx * 0.9 + Date.now() * 0.01)) * 0.8 + 0.3
            bar.style.transform = `scaleY(${wave.toFixed(3)})`
          } else {
            bar.style.transform = `scaleY(0.25)`
          }
        })
      }
      animId = requestAnimationFrame(updateBars)
    }

    animId = requestAnimationFrame(updateBars)
    return () => cancelAnimationFrame(animId)
  }, [audioLevelRef, mode])

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 w-full rounded-xl border border-os-border bg-os-raised/80 px-3.5 py-2 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggle}
            aria-label={mode === "listening" ? "Stop listening" : "Start speaking"}
            className={`flex items-center justify-center size-8 rounded-lg border transition-all ${
              mode === "listening"
                ? "border-red-500 bg-red-500/20 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.3)] animate-pulse"
                : mode === "thinking"
                ? "border-amber-500 bg-amber-500/20 text-amber-400"
                : mode === "speaking"
                ? "border-blue-500 bg-blue-500/20 text-blue-400"
                : "border-os-border bg-os-surface text-os-muted hover:text-os-text hover:border-os-accent"
            }`}
          >
            {mode === "thinking" ? (
              <Loader2 className="size-4 animate-spin text-amber-400" />
            ) : mode === "speaking" ? (
              <Volume2 className="size-4 text-blue-400" />
            ) : (
              <Mic className="size-4" />
            )}
          </button>
          <div>
            <div className="text-xs font-semibold text-os-text flex items-center gap-1.5">
              <span>{MODE_LABELS[mode].title}</span>
              <span
                className={`size-1.5 rounded-full ${
                  mode === "listening"
                    ? "bg-red-500 animate-ping"
                    : mode === "thinking"
                    ? "bg-amber-500 animate-pulse"
                    : mode === "speaking"
                    ? "bg-blue-500"
                    : "bg-emerald-500"
                }`}
              />
            </div>
            <div className="text-[10px] font-mono text-os-dim truncate max-w-[200px]">
              {MODE_LABELS[mode].hint}
            </div>
          </div>
        </div>

        {/* Compact audio waveform bars */}
        <div className="flex items-center gap-1 h-5 px-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              ref={(el) => {
                if (el) barsRef.current[i] = el
              }}
              className={`w-1 rounded-full origin-bottom transition-all duration-75 ${
                mode === "listening"
                  ? "bg-red-400"
                  : mode === "thinking"
                  ? "bg-amber-400"
                  : mode === "speaking"
                  ? "bg-blue-400"
                  : "bg-os-border-bright"
              }`}
              style={{ height: "16px", transform: "scaleY(0.25)" }}
            />
          ))}
        </div>
      </div>
    )
  }

  // Full Centerpiece Mode (Replaces the floating orb)
  return (
    <div className="flex flex-col items-center justify-center py-4 w-full select-none">
      {/* Central Interactive Neural Waveform Hub */}
      <div className="relative flex items-center justify-center size-36">
        {/* Outer breathing aura */}
        <div
          className={`absolute inset-0 rounded-full transition-all duration-700 pointer-events-none ${
            mode === "listening"
              ? "bg-red-500/15 ring-2 ring-red-500/30 scale-110 blur-md animate-pulse"
              : mode === "thinking"
              ? "bg-amber-500/10 ring-2 ring-amber-500/25 scale-105 blur-md"
              : mode === "speaking"
              ? "bg-blue-500/10 ring-2 ring-blue-500/25 scale-105 blur-md"
              : "bg-os-accent/5 ring-1 ring-os-accent/15 blur-sm"
          }`}
        />

        {/* Outer orbit decoration ring */}
        <div
          className={`absolute -inset-2 rounded-full border border-dashed transition-all duration-500 pointer-events-none ${
            mode === "listening"
              ? "border-red-500/40 animate-[spin_8s_linear_infinite]"
              : mode === "thinking"
              ? "border-amber-500/40 animate-[spin_4s_linear_infinite]"
              : mode === "speaking"
              ? "border-blue-500/40 animate-[spin_10s_linear_infinite]"
              : "border-os-border opacity-40"
          }`}
        />

        {/* Central clickable Core button */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={
            mode === "listening"
              ? "Stop listening"
              : mode === "speaking"
              ? "Stop speaking"
              : "Start listening"
          }
          className={`relative z-10 flex flex-col items-center justify-center size-24 rounded-full border backdrop-blur-md shadow-xl transition-all duration-300 group ${
            mode === "listening"
              ? "border-red-500 bg-red-500/10 shadow-red-500/20 scale-105"
              : mode === "thinking"
              ? "border-amber-500/80 bg-amber-500/10 shadow-amber-500/20"
              : mode === "speaking"
              ? "border-blue-500/80 bg-blue-500/10 shadow-blue-500/20"
              : "border-os-border-bright bg-os-raised/80 hover:border-os-accent hover:bg-os-raised hover:scale-105"
          }`}
        >
          {mode === "thinking" ? (
            <Loader2 className="size-7 text-amber-400 animate-spin" />
          ) : mode === "speaking" ? (
            <Volume2 className="size-7 text-blue-400 animate-pulse" />
          ) : mode === "listening" ? (
            <Mic className="size-7 text-red-400 animate-bounce" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1">
              <Mic className="size-6 text-os-text group-hover:text-os-accent transition-colors" />
            </div>
          )}

          <span className="mt-1 font-mono text-[9px] uppercase tracking-wider font-semibold text-os-muted group-hover:text-os-text transition-colors">
            {mode === "listening"
              ? "Stop"
              : mode === "speaking"
              ? "Mute"
              : mode === "thinking"
              ? "···"
              : "Talk"}
          </span>
        </button>
      </div>

      {/* Reactive Neural Equalizer Waveform */}
      <div className="flex items-center justify-center gap-1.5 h-8 mt-4 px-4 py-1">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            ref={(el) => {
              if (el) barsRef.current[i] = el
            }}
            className={`w-1 rounded-full origin-bottom transition-all duration-75 ${
              mode === "listening"
                ? "bg-gradient-to-t from-red-600 to-red-400 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
                : mode === "thinking"
                ? "bg-gradient-to-t from-amber-600 to-amber-400"
                : mode === "speaking"
                ? "bg-gradient-to-t from-blue-600 to-cyan-400"
                : "bg-os-border-bright/60"
            }`}
            style={{ height: "24px", transform: "scaleY(0.25)" }}
          />
        ))}
      </div>

      {/* Status indicator pill */}
      <div className="mt-2.5 flex items-center gap-2 rounded-full border border-os-border bg-os-raised/60 px-3 py-1">
        <span
          className={`size-2 rounded-full ${
            mode === "listening"
              ? "bg-red-500 animate-ping"
              : mode === "thinking"
              ? "bg-amber-500 animate-pulse"
              : mode === "speaking"
              ? "bg-blue-500 animate-pulse"
              : "bg-emerald-500"
          }`}
        />
        <span className="font-mono text-[11px] font-medium text-os-text">
          {MODE_LABELS[mode].title}
        </span>
        <span className="text-[10px] text-os-dim">· {MODE_LABELS[mode].hint}</span>
      </div>
    </div>
  )
}
