"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { forMode, rankCommands, type PaletteCommand } from "@/lib/os/palette-sources"
import { useAdvancedMode } from "@/components/advanced-only"
import { PALETTE_OPEN_EVENT } from "@/components/os/topbar"

/** True when the shortcut would be stolen from a real text field — the in-app
 *  terminal and the skill editor both live on the page, and ⌘K has to keep
 *  meaning "insert a line" / "clear the screen" there, not "open the palette". */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA"
}

/**
 * ⌘K / Ctrl+K command palette. Commands are built server-side (see
 * `lib/os/palette-sources.ts`) and passed in — this component only ranks,
 * displays and navigates.
 */
export function CommandPalette({ commands }: { commands: PaletteCommand[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      const isShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"
      if (isShortcut) {
        // Only block OPENING from a text field — once the palette is open,
        // its own search input is itself a text field, and ⌘K still has to
        // be able to close it.
        if (!open && isTypingTarget(e.target)) return
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (e.key === "Escape" && open) setOpen(false)
    }
    // The toolbar's Search button asks through this event. Nothing listened
    // for it, so clicking the button did nothing and only ⌘K worked.
    const onOpenRequest = () => setOpen(true)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener(PALETTE_OPEN_EVENT, onOpenRequest)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener(PALETTE_OPEN_EVENT, onOpenRequest)
    }
  }, [open])

  useEffect(() => {
    setSelected(0)
    if (!open) setQuery("")
  }, [open, query])

  const advanced = useAdvancedMode()
  const results = rankCommands(forMode(commands, advanced), query)

  function go(cmd: PaletteCommand) {
    setOpen(false)
    router.push(cmd.href)
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const cmd = results[selected]
      if (cmd) go(cmd)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-lg gap-0 p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Jump to a page, company, or agent…"
          aria-label="Search commands"
          aria-controls="command-palette-list"
          aria-activedescendant={results[selected] ? `command-${results[selected].id}` : undefined}
          role="combobox"
          aria-expanded={open}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-foreground outline-hidden"
        />
        <ul id="command-palette-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.map((cmd, i) => (
            <li key={cmd.id}>
              <button
                type="button"
                id={`command-${cmd.id}`}
                role="option"
                aria-selected={i === selected}
                onMouseEnter={() => setSelected(i)}
                onClick={() => go(cmd)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                  i === selected ? "bg-muted text-foreground" : "text-foreground/90"
                }`}
              >
                <span>{cmd.label}</span>
                <span className="text-xs text-muted-foreground">{cmd.hint}</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
