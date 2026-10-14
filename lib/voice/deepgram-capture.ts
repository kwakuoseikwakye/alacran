"use client"

/**
 * Microphone → Deepgram, in the renderer.
 *
 * **Why this exists at all:** the Web Speech API is Chromium-only and streams
 * to Google. A raw WebSocket plus an AudioWorklet works in both of this app's
 * shells (Electron on macOS, WebKitGTK on Linux) and sends audio to an account
 * the user chose.
 *
 * The awkward details below are ported from Jinsoku's own client rather than
 * rediscovered — each one is a real failure it already paid for:
 *
 * - **KeepAlive every 5s.** Deepgram closes the socket after ~10s with no
 *   audio. A user who presses the orb and thinks before speaking loses the
 *   connection without this.
 * - **CloseStream on stop**, or the last utterance is never finalised and the
 *   final transcript is silently lost.
 * - **Finals are re-emitted.** Deepgram sends a final, then sends it again
 *   with better punctuation. Appending naively duplicates the sentence.
 * - **Int16 conversion on the audio thread**, not the main thread, so a long
 *   utterance doesn't jank the orb's animation.
 *
 * **Everything that can go wrong here is silent by nature, so nothing is
 * allowed to fail quietly.** A microphone the OS has muted still resolves
 * `getUserMedia`, a socket rejected for a bad parameter closes without ever
 * firing `onerror`, and a transcript below a confidence bar simply never
 * arrives. Each of those looks identical from the outside — a listening orb
 * that never does anything — so each one reports itself below.
 */

/** Deepgram's `linear16` wants raw Int16LE at the context's sample rate. Doing
 *  the conversion in a worklet keeps it off the thread that paints. */
const WORKLET_SOURCE = `
class PcmWorklet extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    const pcm = new Int16Array(channel.length)
    for (let i = 0; i < channel.length; i++) {
      const clamped = Math.max(-1, Math.min(1, channel[i]))
      pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    }
    this.port.postMessage(pcm, [pcm.buffer])
    return true
  }
}
registerProcessor('pcm-worklet', PcmWorklet)
`

const KEEPALIVE_MS = 5_000

/**
 * Finals only. **The interim gate was deleted, and that is the fix for "it
 * never shows what I'm saying".**
 *
 * An interim result is provisional by definition — it exists to be shown and
 * then replaced a moment later — so withholding one until Deepgram is confident
 * means the caption stays empty through the entire first half of a sentence,
 * which reads exactly like a microphone that isn't working. Measured on real
 * speech, interims climb 0.93 → 0.98 → 0.99, so a 0.6 bar passes clean audio
 * and blocks precisely the marginal audio the speaker most needs to see, to
 * know they are being misheard.
 *
 * The final bar stays, because a final is what gets ASKED, and asking the wrong
 * question is worse than asking none. A final below it is reported rather than
 * dropped — see `onUnclear`.
 */
const MIN_FINAL_CONFIDENCE = 0.5

/** Below this the analyser is reading a dead channel rather than a quiet room:
 *  a muted or OS-blocked microphone reads a flat zero, while genuine silence
 *  still carries a noise floor. */
const SILENCE_FLOOR = 0.008
/** How long a flat-zero channel is tolerated before saying so. Long enough to
 *  cover a device warming up, short enough to beat a user's patience. */
const DEAD_MIC_MS = 4_000

export type CaptureHandle = {
  /** Feeds the orb's level meter. Null if the mic could not be opened, in
   *  which case the orb falls back to its synthetic idle motion. */
  analyser: AnalyserNode | null
  stop: () => void
}

export type MintGrant = (
  sampleRate: number
) => Promise<{ ok: true; token: string; url?: string } | { ok: false; message: string }>

export type CaptureOptions = {
  /**
   * Called once the real capture format is known.
   *
   * **The grant is minted AFTER the AudioContext exists, on purpose.** The
   * socket URL declares a sample rate and the worklet produces one, and the
   * only way those cannot disagree is for the same number to produce both.
   * Chromium honours `new AudioContext({ sampleRate: 16000 })`; WebKitGTK — the
   * Linux shell — is entitled to ignore it and hand back the hardware's 44.1k,
   * which would have shipped audio labelled 16k and transcribed as noise, with
   * no error anywhere.
   */
  mintGrant: MintGrant
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  /** A final Deepgram itself wasn't sure of. Worth showing — it is usually
   *  right about the fact that it heard something. */
  onUnclear?: (text: string) => void
  onError: (message: string) => void
}

type DeepgramAlternative = { transcript?: string; confidence?: number }
type DeepgramMessage = {
  type?: string
  is_final?: boolean
  channel?: { alternatives?: DeepgramAlternative[] }
}

export async function startDeepgramCapture(options: CaptureOptions): Promise<CaptureHandle> {
  const { mintGrant, onInterim, onFinal, onUnclear, onError } = options

  let stream: MediaStream | null = null
  let context: AudioContext | null = null
  let socket: WebSocket | null = null
  let keepAlive: ReturnType<typeof setInterval> | null = null
  let deadMicTimer: ReturnType<typeof setTimeout> | null = null
  let finalizeTimer: ReturnType<typeof setTimeout> | null = null
  let accumulatedFinal = ""
  let stopped = false
  let lastFinal = ""

  const stop = () => {
    if (stopped) return
    stopped = true
    if (finalizeTimer) {
      clearTimeout(finalizeTimer)
      finalizeTimer = null
    }
    accumulatedFinal = ""
    if (keepAlive) clearInterval(keepAlive)
    if (deadMicTimer) clearTimeout(deadMicTimer)
    // Flush: without CloseStream the trailing words never come back as a final.
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: "CloseStream" }))
      } catch {
        /* socket already going down */
      }
    }
    socket?.close()
    stream?.getTracks().forEach((track) => track.stop())
    void context?.close().catch(() => {})
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    onError("Alacrán couldn't use the microphone. Check this app's microphone permission.")
    return { analyser: null, stop }
  }

  // Ask for 16 kHz, then believe the answer rather than the request — see
  // `mintGrant` above for why the two must not be assumed equal.
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  context = new Ctor({ sampleRate: 16000 })
  if (context.state === "suspended") await context.resume()
  const sampleRate = Math.round(context.sampleRate)

  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.72
  source.connect(analyser)

  const grant = await mintGrant(sampleRate)
  if (stopped) return { analyser, stop }
  if (!grant.ok || !grant.url) {
    onError(grant.ok ? "Couldn't start listening." : grant.message)
    stop()
    return { analyser, stop }
  }

  /**
   * A microphone the operating system has muted, or that this app was never
   * granted, still produces a MediaStream — it just carries nothing. Reading a
   * flat zero for several seconds is the only way to tell that apart from a
   * quiet room, and saying so is the difference between "the app is broken" and
   * one settings toggle.
   */
  const levels = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
  deadMicTimer = setTimeout(() => {
    if (stopped) return
    analyser.getByteFrequencyData(levels)
    let sum = 0
    for (let i = 0; i < 64; i++) sum += levels[i]
    if (sum / 64 / 255 < SILENCE_FLOOR) {
      onError(
        "No sound is reaching the microphone. Check that the right input device is selected and that Alacrán is allowed to use it in your system's privacy settings."
      )
      stop()
    }
  }, DEAD_MIC_MS)

  // The subprotocol is `bearer`, NOT `token`. `token` is for a raw Deepgram
  // API key; a minted grant is a JWT and is rejected with 401 under it.
  socket = new WebSocket(grant.url, ["bearer", grant.token])
  socket.binaryType = "arraybuffer"

  let workletNode: AudioWorkletNode | null = null
  const workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }))

  socket.onopen = async () => {
    if (stopped || !context) return
    try {
      await context.audioWorklet.addModule(workletUrl)
      workletNode = new AudioWorkletNode(context, "pcm-worklet")
      workletNode.port.onmessage = (event: MessageEvent<Int16Array>) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(event.data.buffer)
      }
      source.connect(workletNode)
      // Not connected to destination on purpose — routing the mic to the
      // speakers is a feedback loop, and a worklet runs without it.
    } catch {
      onError("This window can't capture audio.")
      stop()
    } finally {
      URL.revokeObjectURL(workletUrl)
    }

    keepAlive = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "KeepAlive" }))
      }
    }, KEEPALIVE_MS)
  }

  const finalize = () => {
    if (finalizeTimer) {
      clearTimeout(finalizeTimer)
      finalizeTimer = null
    }
    const ready = accumulatedFinal.trim()
    if (ready) {
      accumulatedFinal = ""
      onFinal(ready)
    }
  }

  socket.onmessage = (event) => {
    let message: DeepgramMessage
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    const alternative = message.channel?.alternatives?.[0]
    const text = alternative?.transcript?.trim()
    if (!text) return
    const confidence = alternative?.confidence ?? 0

    if (message.is_final) {
      // Deepgram re-sends a final with refined punctuation; without this the
      // same sentence is asked twice.
      if (text === lastFinal) return
      lastFinal = text
      if (confidence < MIN_FINAL_CONFIDENCE) {
        // Never silently discarded: the speaker gets to see the thing that was
        // almost understood, instead of watching nothing happen.
        onUnclear?.(text)
        return
      }
      accumulatedFinal = accumulatedFinal ? `${accumulatedFinal} ${text}` : text
      onInterim(accumulatedFinal)

      // When the user pauses, wait 1000ms before finalizing in case they continue speaking
      if (finalizeTimer) clearTimeout(finalizeTimer)
      finalizeTimer = setTimeout(finalize, 1000)
      return
    }

    // New interim speech arrived — user is actively speaking, so cancel any pending silence timer
    if (finalizeTimer) {
      clearTimeout(finalizeTimer)
      finalizeTimer = null
    }
    const live = accumulatedFinal ? `${accumulatedFinal} ${text}` : text
    onInterim(live)
  }

  socket.onerror = () => {
    if (!stopped) onError("Lost the connection to Deepgram.")
  }

  /**
   * **A rejected socket closes without ever firing `onerror`.** Deepgram
   * refuses an unsupported model/language pair at the handshake, and the whole
   * failure used to arrive as an orb that listened forever — the single most
   * confusing shape this feature had.
   */
  socket.onclose = (event) => {
    if (stopped || event.code === 1000) return
    const detail = event.reason?.trim()
    onError(detail ? `Deepgram closed the connection: ${detail}` : `Deepgram closed the connection (${event.code}).`)
    stop()
  }

  return { analyser, stop }
}
