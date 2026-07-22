import { diffLines } from "diff"

export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = diffLines(oldText, newText)
  return (
    <pre className="whitespace-pre-wrap text-xs">
      {parts.map((part, i) => (
        <span
          key={i}
          className={
            part.added
              ? "bg-green-500/20 text-green-700 dark:text-green-400"
              : part.removed
                ? "bg-red-500/20 text-red-700 dark:text-red-400 line-through"
                : ""
          }
        >
          {part.value}
        </span>
      ))}
    </pre>
  )
}
