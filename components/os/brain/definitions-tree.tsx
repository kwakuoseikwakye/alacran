"use client"

import { useState } from "react"
import type { DefinitionsNode } from "@/lib/os/brain/definitions-files"

function TreeNode({ node, depth }: { node: DefinitionsNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1)
  const [showContent, setShowContent] = useState(false)
  const indent = { paddingLeft: depth * 14 + 8 }

  if (node.kind === "dir") {
    return (
      <li>
        <button type="button" className="brain-tree-row" style={indent} onClick={() => setOpen((o) => !o)}>
          <span aria-hidden>{open ? "▾" : "▸"}</span> {node.name}/
        </button>
        {open && (
          <ul>
            {node.children.map((child) => (
              <TreeNode key={child.path} node={child} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        className="brain-tree-row"
        style={indent}
        aria-expanded={showContent}
        onClick={() => setShowContent((s) => !s)}
      >
        {node.name}
      </button>
      {showContent && <pre className="brain-tree-content">{node.content || "(empty file)"}</pre>}
    </li>
  )
}

/** The raw tree for `definitions/` — read-only, so there is always a way to
 *  see the actual bytes behind the graph and the lifecycle board. */
export function DefinitionsTree({ tree }: { tree: DefinitionsNode[] }) {
  if (tree.length === 0) {
    return <p className="brain-empty">No definitions/ yet — run /define-company.</p>
  }
  return (
    <ul className="brain-tree" aria-label="definitions folder">
      {tree.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} />
      ))}
    </ul>
  )
}
