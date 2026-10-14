import { diffLines } from "diff"

export type ChangeType = "created" | "modified" | "deleted" | "identical"

export interface DiffStats {
  linesAdded: number
  linesRemoved: number
  linesUnchanged: number
  changeType: ChangeType
}

/**
 * Computes line-level diff statistics and high-level change type.
 */
export function computeDiffStats(oldText: string, newText: string): DiffStats {
  if (oldText === newText) {
    const lines = oldText ? oldText.split("\n").length : 0
    return {
      linesAdded: 0,
      linesRemoved: 0,
      linesUnchanged: lines,
      changeType: "identical",
    }
  }

  const isCreated = !oldText.trim() && Boolean(newText.trim())
  const isDeleted = Boolean(oldText.trim()) && !newText.trim()

  const parts = diffLines(oldText, newText)
  let linesAdded = 0
  let linesRemoved = 0
  let linesUnchanged = 0

  for (const part of parts) {
    const count =
      part.count ??
      (part.value
        ? part.value.split("\n").filter((l, i, arr) => i < arr.length - 1 || l.length > 0).length
        : 0)

    if (part.added) {
      linesAdded += count
    } else if (part.removed) {
      linesRemoved += count
    } else {
      linesUnchanged += count
    }
  }

  return {
    linesAdded,
    linesRemoved,
    linesUnchanged,
    changeType: isCreated ? "created" : isDeleted ? "deleted" : "modified",
  }
}
