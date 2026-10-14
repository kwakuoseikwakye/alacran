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
              ? "bg-success/20 text-success"
              : part.removed
                ? "bg-destructive/20 text-destructive line-through"
                : ""
          }
        >
          {part.value}
        </span>
      ))}
    </pre>
  )
}
