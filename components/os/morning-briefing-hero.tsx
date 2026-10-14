"use client"

import React, { useState, useEffect, useRef } from "react"
import Link from "next/link"
import {
  Play,
  Pause,
  RotateCcw,
  VolumeX,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react"
import type { ExecutiveBriefingData } from "@/lib/os/executive-briefing"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount)
}

function WaveformBars({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="flex items-center gap-0.5 h-4 px-1" aria-hidden="true">
      <span
        className={`w-0.5 rounded-full bg-emerald-400 transition-all ${
          isPlaying ? "h-3.5 animate-pulse" : "h-1.5 opacity-40"
        }`}
      />
      <span
        className={`w-0.5 rounded-full bg-emerald-400 transition-all ${
          isPlaying ? "h-4 animate-pulse delay-75" : "h-2.5 opacity-40"
        }`}
      />
      <span
        className={`w-0.5 rounded-full bg-emerald-400 transition-all ${
          isPlaying ? "h-2.5 animate-pulse delay-150" : "h-1 opacity-40"
        }`}
      />
      <span
        className={`w-0.5 rounded-full bg-emerald-400 transition-all ${
          isPlaying ? "h-3 animate-pulse delay-100" : "h-2 opacity-40"
        }`}
      />
    </div>
  )
}

export function MorningBriefingHero({ briefing, showNextMove = true }: { briefing: ExecutiveBriefingData; showNextMove?: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState<1 | 1.2 | 1.5>(1)
  const [hasVoiceSupport, setHasVoiceSupport] = useState(false)
  const [showFullScript, setShowFullScript] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setHasVoiceSupport(true)
    }

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  function toggleAudio() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return

    if (isPlaying) {
      window.speechSynthesis.cancel()
      setIsPlaying(false)
      return
    }

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(briefing.audioScript)
    utterance.rate = playbackRate
    utterance.onstart = () => setIsPlaying(true)
    utterance.onend = () => setIsPlaying(false)
    utterance.onerror = () => setIsPlaying(false)

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }

  function handleReplay() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    window.speechSynthesis.cancel()
    setIsPlaying(false)
    setTimeout(() => {
      toggleAudio()
    }, 100)
  }

  function cyclePlaybackRate() {
    const nextRate: 1 | 1.2 | 1.5 = playbackRate === 1 ? 1.2 : playbackRate === 1.2 ? 1.5 : 1
    setPlaybackRate(nextRate)
    if (isPlaying) {
      // Re-trigger with new rate
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(briefing.audioScript)
      utterance.rate = nextRate
      utterance.onstart = () => setIsPlaying(true)
      utterance.onend = () => setIsPlaying(false)
      utterance.onerror = () => setIsPlaying(false)
      utteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
    }
  }

  const { metrics, nextAction } = briefing

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-os-border bg-os-surface/90 p-5 sm:p-6 shadow-md backdrop-blur-md mb-6"
      aria-labelledby="briefing-hero-title"
    >
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl"
        aria-hidden="true"
      />

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-os-border pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Sparkles className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="briefing-hero-title" className="font-display text-base font-bold text-os-text">
                Morning briefing
              </h2>
              <span className="rounded-full bg-os-surface2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-os-border">
                {briefing.companyName}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{briefing.dateFormatted}</p>
          </div>
        </div>

        {/* Audio Player Controls */}
        {hasVoiceSupport ? (
          <div className="flex items-center gap-1.5 rounded-full border border-os-border bg-os-surface2/90 px-3 py-1 text-xs">
            <button
              type="button"
              onClick={toggleAudio}
              className={`flex items-center gap-1.5 font-medium transition-colors ${
                isPlaying
                  ? "text-emerald-400 hover:text-emerald-300"
                  : "text-os-text hover:text-emerald-400"
              }`}
              aria-label={isPlaying ? "Pause audio briefing" : "Play audio briefing"}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Listen</span>
                </>
              )}
            </button>

            <WaveformBars isPlaying={isPlaying} />

            <button
              type="button"
              onClick={cyclePlaybackRate}
              className="rounded px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-os-border/50"
              aria-label={`Playback speed: currently ${playbackRate}x`}
            >
              {playbackRate}x
            </button>

            <button
              type="button"
              onClick={handleReplay}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Replay briefing"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <VolumeX className="w-3.5 h-3.5" />
            <span>Voice unavailable</span>
          </div>
        )}
      </header>

      {/* Synthesis Content */}
      <div className="mt-4 space-y-3">
        <p className="text-sm leading-relaxed text-os-text font-medium">
          {briefing.summaryParagraph}
        </p>

        {showFullScript && (
          <div className="rounded-lg border border-os-border bg-os-surface2 p-3 text-xs text-muted-foreground leading-relaxed italic">
            &ldquo;{briefing.audioScript}&rdquo;
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setShowFullScript(!showFullScript)}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            {showFullScript ? "Hide audio transcript" : "Read spoken transcript"}
          </button>
        </div>
      </div>

      {/* Live Operational Metric Pills */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-os-border/60">
        <Link
          href={`/c/${briefing.companyId}/tasks`}
          className="group flex items-center justify-between rounded-lg border border-os-border bg-os-surface2/60 p-2.5 transition hover:border-os-border-hover hover:bg-os-surface2"
        >
          <div className="flex items-center gap-2">
            {metrics.pendingReviewsCount > 0 ? (
              <ShieldAlert className="w-4 h-4 text-amber-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            )}
            <div>
              <span className="text-xs font-semibold text-os-text block">
                {metrics.pendingReviewsCount} Approval{metrics.pendingReviewsCount === 1 ? "" : "s"}
              </span>
              <span className="text-[10.5px] text-muted-foreground">
                {metrics.safeReviewsCount} safe to approve
              </span>
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>

        <Link
          href={`/c/${briefing.companyId}/funnel`}
          className="group flex items-center justify-between rounded-lg border border-os-border bg-os-surface2/60 p-2.5 transition hover:border-os-border-hover hover:bg-os-surface2"
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <div>
              <span className="text-xs font-semibold text-os-text block">
                {formatCurrency(metrics.pipelineValue)} Pipeline
              </span>
              <span className="text-[10.5px] text-muted-foreground">
                {metrics.leadsCount} active lead{metrics.leadsCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>

        <Link
          href={`/c/${briefing.companyId}/finances`}
          className="group flex items-center justify-between rounded-lg border border-os-border bg-os-surface2/60 p-2.5 transition hover:border-os-border-hover hover:bg-os-surface2"
        >
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-cyan-400" />
            <div>
              <span className="text-xs font-semibold text-os-text block">
                {formatCurrency(metrics.cashBalance)} Cash
              </span>
              <span className="text-[10.5px] text-muted-foreground">Operating reserves</span>
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>

      {/* Recommended Next Action CTA */}
      {showNextMove && (
      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
        <div>
          <span className="font-semibold text-emerald-400">Recommended Next Move:</span>{" "}
          <span className="text-foreground">{nextAction.title}</span>
          <span className="text-muted-foreground block text-[11px] mt-0.5">{nextAction.detail}</span>
        </div>
        <Link
          href={nextAction.href}
          className="whitespace-nowrap inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 transition-colors"
        >
          <span>Take Action</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      )}
    </section>
  )
}
