import crypto from "node:crypto"

export const START_PREFIX = "<!-- alacran:operating-guide:start"
export const END_MARKER = "<!-- alacran:operating-guide:end -->"

export const sha256 = (s: string): string => crypto.createHash("sha256").update(s).digest("hex")
export const toLf = (s: string): string => s.replace(/\r\n/g, "\n")
