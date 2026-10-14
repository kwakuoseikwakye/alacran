/**
 * Canva facts for make-posts. FALLBACK — step zero (v199 Task 0) has not
 * been run yet, so every list is empty and make-posts runs text-only
 * ("Open in Canva"). Task 0b replaces these with values measured in step
 * zero; after that, change a value only by re-measuring. Never fill these
 * from guesses.
 */
export const CANVA_SERVER_NAME = "canva"

/** Exact names Claude Code reports for Canva's design tools (empty until measured). */
export const CANVA_DESIGN_TOOLS: string[] = []

/** Exact names of every Canva tool that shares, publishes, deletes or changes access (empty until measured). */
export const CANVA_GATED_TOOLS: string[] = []

/** Hosts an export link (and any redirect it follows) is served from (empty until measured). */
export const CANVA_IMAGE_HOSTS: string[] = []

/** True when step zero found the export link dies within an hour, so the card must save it on first view (false until measured). */
export const SAVE_IMAGE_ON_VIEW = false
