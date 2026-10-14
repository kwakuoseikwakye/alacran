/**
 * Strips noisy CLI diagnostics, banners, stdin prompts, and session logs from
 * executor stderr, returning only the actual human-actionable error message.
 */
export function cleanAssistantStderr(raw: string): string {
  if (!raw) return ""
  const lines = raw.split("\n")
  let inUserEcho = false
  const meaningful = lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (/^reading additional input from stdin/i.test(trimmed)) return false
    if (/^warning: no stdin data received/i.test(trimmed)) return false
    if (/^openai codex/i.test(trimmed)) return false
    if (/^-{3,}$/.test(trimmed)) return false
    if (
      /^(workdir|model|provider|approval|sandbox|reasoning effort|reasoning summaries|session id):/i.test(
        trimmed
      )
    ) {
      return false
    }
    if (/^tokens used/i.test(trimmed)) return false
    if (/^\d{1,3}(,\d{3})*$/.test(trimmed)) return false
    if (/^hook:\s+\w+/i.test(trimmed)) return false
    if (/ERROR\s+codex_models_manager/i.test(trimmed)) return false
    if (/^user$/i.test(trimmed)) {
      inUserEcho = true
      return false
    }
    if (/^(codex|assistant)$/i.test(trimmed)) {
      inUserEcho = false
      return false
    }
    if (inUserEcho && !trimmed.toLowerCase().startsWith("error")) {
      return false
    }
    return true
  })
  return meaningful.join("\n").trim()
}

/**
 * Turns a failed assistant run into a sentence a non-technical user can act
 * on. The raw text ("spawn claude ENOENT", "Process exited with code 1") is
 * what every failure used to show; only the four failures people actually hit
 * are recognised, and anything else passes through unchanged rather than
 * being guessed at.
 */
export function explainAssistantFailure(message: string, executorLabel: string): string {
  if (/\bENOENT\b|command not found/i.test(message)) {
    return `${executorLabel} isn't installed on this computer yet. Install it from Connected tools, then ask again.`
  }
  if (/not logged in|please run \/login|invalid api key|unauthori[sz]ed|\b401\b|login required/i.test(message)) {
    return `${executorLabel} needs you to sign in. Open Connected tools and press Sign in, then ask again.`
  }
  if (/usage limit|session limit|rate limit|\b429\b|quota/i.test(message)) {
    return `${executorLabel} has reached its usage limit for now. Try again later, or check your plan.`
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|getaddrinfo|network (error|is unreachable)/i.test(message)) {
    return `${executorLabel} couldn't connect. Check your internet connection and try again.`
  }
  if (/^Process exited with code \d+$/.test(message.trim())) {
    return `${executorLabel} stopped before answering. Try again in a moment.`
  }
  return message
}
