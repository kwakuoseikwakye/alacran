/**
 * The nine languages the assistant listens in, from the design.
 *
 * `code` is a BCP-47 tag handed to SpeechRecognition; `name` is the English
 * name handed to the model so it knows what it is translating FROM; `label` is
 * the endonym shown in the picker, because someone looking for Japanese scans
 * for 日本語, not for "Japanese".
 */
export type AssistantLanguage = { code: string; label: string; name: string }

export const ASSISTANT_LANGUAGES: AssistantLanguage[] = [
  { code: "en-US", label: "English", name: "English" },
  { code: "hi-IN", label: "हिन्दी", name: "Hindi" },
  { code: "es-ES", label: "Español", name: "Spanish" },
  { code: "fr-FR", label: "Français", name: "French" },
  { code: "de-DE", label: "Deutsch", name: "German" },
  { code: "pt-BR", label: "Português", name: "Portuguese" },
  { code: "ar-SA", label: "العربية", name: "Arabic" },
  { code: "ja-JP", label: "日本語", name: "Japanese" },
  { code: "zh-CN", label: "中文", name: "Mandarin Chinese" },
]

export const DEFAULT_ASSISTANT_LANGUAGE = "en-US"

export function languageName(code: string): string {
  return ASSISTANT_LANGUAGES.find((l) => l.code === code)?.name ?? "English"
}

/** English needs no translation pass, so it takes the plain-text path — one
 *  less thing to parse, and one less way for an answer to be lost. */
export function needsTranslation(code: string): boolean {
  return languageName(code) !== "English"
}
