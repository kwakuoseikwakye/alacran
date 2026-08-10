"use client"

import { useEffect, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

const ORDER_KEY = "alacran-card-order"

/**
 * Ids in the order the user last dragged them to. Falls back to whatever
 * default order the caller passed in for any id it doesn't mention (new
 * agents, or a first-ever visit).
 */
function loadOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(ORDER_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function applyOrder(defaultIds: string[], saved: string[]): string[] {
  const known = new Set(defaultIds)
  const ordered = saved.filter((id) => known.has(id))
  const missing = defaultIds.filter((id) => !ordered.includes(id))
  return [...ordered, ...missing]
}

/** Drag-and-drop reorderable grid of agent cards, persisted to localStorage per browser. */
export function ReorderableGrid({ items }: { items: { id: string; node: ReactNode }[] }) {
  const defaultIds = items.map((i) => i.id)
  const [order, setOrder] = useState(defaultIds)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // Reconciled client-side only — localStorage isn't available during SSR,
  // and the default (registration) order is a fine first paint anyway.
  useEffect(() => {
    setOrder(applyOrder(defaultIds, loadOrder()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  function moveTo(targetId: string) {
    if (!draggingId || draggingId === targetId) return
    setOrder((current) => {
      const next = current.filter((id) => id !== draggingId)
      next.splice(next.indexOf(targetId), 0, draggingId)
      window.localStorage.setItem(ORDER_KEY, JSON.stringify(next))
      return next
    })
  }

  const byId = new Map(items.map((i) => [i.id, i.node]))

  return (
    <div className="bento-grid">
      {order.map((id) => (
        <div
          key={id}
          draggable
          onDragStart={() => setDraggingId(id)}
          onDragEnd={() => setDraggingId(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            moveTo(id)
          }}
          className={cn("cursor-grab active:cursor-grabbing", draggingId === id && "opacity-40")}
        >
          {byId.get(id)}
        </div>
      ))}
    </div>
  )
}
