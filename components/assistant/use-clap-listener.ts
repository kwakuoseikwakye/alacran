"use client"

import { useEffect, useRef, useState } from "react"
import { BLOCK_MS, createClapDetector } from "@/lib/voice/clap-detector"

/**
 * Holds the microphone open and calls `onClap` on a double clap, for as long as `active` is true.
 *
 * It only ever MEASURES loudness: no recording, no speech recognition, nothing leaves this window. The
 * stream, the audio graph and the timer are all released the moment `active` goes false or the
 * component unmounts, including when that happens while the microphone is still being opened (a
 * cancelled flag, because the open is asynchronous and React's development double-mount would
 * otherwise leave a stream running that nothing owns).
 *
 * It also lets go whenever the page is hidden (another tab, a minimised window): a microphone held for a
 * clap nobody can see being waited for is exactly what the microphone switch is there to prevent.
 *
 * Echo cancellation, noise suppression and auto gain are switched off: all three are built to remove
 * exactly the short loud transient a clap is, and auto gain would turn the room's silence up until a
 * quiet clap looked like speech.
 */
export function useClapListener(active: boolean, onClap: () => void): void {
  const onClapRef = useRef(onClap)
  useEffect(() => {
    onClapRef.current = onClap
  })

  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible")
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => document.removeEventListener("visibilitychange", sync)
  }, [])

  const listening = active && visible
  useEffect(() => {
    if (!listening) return
    let cancelled = false
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    let timer: ReturnType<typeof setInterval> | null = null

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        })
      } catch {
        return // refused or no microphone: the Assistant simply keeps waiting for a press
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      context = new Ctx()
      if (context.state === "suspended") await context.resume()
      if (cancelled) return // the cleanup below has already released everything it could see

      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      context.createMediaStreamSource(stream).connect(analyser)
      // Over an explicit ArrayBuffer for the same lib.dom reason as the level meter in assistant-stage.tsx.
      const samples = new Float32Array(new ArrayBuffer(analyser.fftSize * 4))
      const detector = createClapDetector()
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
        if (detector.push(Math.sqrt(sum / samples.length), performance.now())) onClapRef.current()
      }, BLOCK_MS)
    })()

    return () => {
      cancelled = true
      if (timer !== null) clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
      void context?.close().catch(() => undefined)
    }
  }, [listening])
}
