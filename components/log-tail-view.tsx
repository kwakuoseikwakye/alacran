export function LogTailView({ content }: { content: string }) {
  return (
    <pre className="max-h-40 overflow-y-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
      {content || "(no output yet)"}
    </pre>
  )
}
