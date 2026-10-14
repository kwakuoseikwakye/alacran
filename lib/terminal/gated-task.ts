import { sanitizeTaskText } from "./task-text"

/**
 * Wording for the five gate rows in AGENTS.md section 6 (money, contracts, irreversible operations,
 * publication, credentials). Each entry starts at a word boundary, so "payment" matches "pay" but
 * "display" does not. An entry that must not match a longer word ends with its own `\b`.
 *
 * ponytail: keyword list, so a paraphrase can slip past it. Tune from real use; the stronger
 * upgrade is asking the model to classify, which would put a model call in front of every task.
 */
const WORDS = [
  // money
  "pay", "invoice", "refund", "charg", "bill", "spen[dt]", "purchas", "buy", "budget", "pric", "quot",
  "discount", "salar", "wire(?:s|d)?\\b", "transfer", "subscri", "fees?\\b", "reimburs", "remit", "settle", "owe(?:s|d)?\\b",
  "(?:re|pre|over)pay", "withdraw", "deposit", "order\\b", "hir(?:e|ing)",
  // contracts
  "sign(?:ed|ing|ature|s)?\\b", "contract", "offer", "proposal", "sow\\b", "renew", "terminat", "compensat", "agreement", "nda\\b",
  "cancel", "submit", "approv", "authori[sz]",
  // irreversible operations
  "delet", "remov", "eras", "wip(?:e|ing)", "destroy", "overwrit", "drop\\b", "dropp", "purg", "reset", "force", "rebase",
  "rewrit(?:e|ing) (?:the )?history",
  // publication
  "publish", "post(?:s|ed|ing)?\\b", "tweet", "announc", "broadcast", "newsletter", "send", "sent\\b", "e-?mail", "go live",
  "releas", "deploy", "push", "ship\\b",
  "repl(?:y|ies)", "messag", "notif", "share", "forward", "upload",
  // more irreversible, publication and money wording
  "rm\\b", "git (?:clean|checkout|restore)", "truncat", "kill", "chmod", "curl",
  "tell", "text\\b", "dm\\b", "ping", "contact", "call\\b", "write to", "let .{0,20}know", "slack", "whatsapp",
  "pull request", "pr\\b", "comment", "issue (?:a|an|the)\\b", "public", "merge", "commit", "go(?:es|ing)? live",
  "money", "lend", "loan", "dollars?", "euros?", "pounds?", "cedis?", "bucks?",
  // credentials
  "grant", "revok", "rotat", "access\\b", "permission", "password", "passcode", "secret", "token", "api[ -]?key", "credential", "invit", "key\\b", "ssh",
]

const GATED_WORDS = new RegExp(WORDS.map((w) => `\\b(?:${w})`).join("|"), "i")
/** A money amount: a currency sign before digits, or digits before a currency word. */
const AMOUNT = /[$€£¥]\s?\d|\b\d[\d,.]*\s?(?:usd|eur|gbp|ghs|dollars?|euros?|pounds?|cedis?)\b/i

/**
 * True when a human must approve this task first, so it must go to the card and never auto-dispatch.
 * Fail-closed: anything that cannot be read with confidence counts as gated.
 */
export function isGatedTask(task: unknown): boolean {
  if (typeof task !== "string") return true
  const text = sanitizeTaskText(task)
  if (!text) return true
  // Control characters became spaces above; anything else outside printable ASCII is a lookalike
  // or another language the keyword list cannot read.
  if (/[^\x20-\x7e]/.test(text)) return true
  if (/^[!/#]/.test(text)) return true
  return GATED_WORDS.test(text) || AMOUNT.test(text)
}
