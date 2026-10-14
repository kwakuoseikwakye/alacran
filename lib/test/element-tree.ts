import { Children } from "react"

/**
 * Typing for tests that call a component as a plain function and walk the
 * returned element tree by hand (`el.props.children[0].props.children`).
 * React 19 types an element's props as `unknown`, which is right for
 * production code and useless for that walk. These are cast-only views: no
 * runtime behaviour, nothing is copied or rewritten.
 */
export type TestProps = {
  children: TestNode
  onClick: () => void
  [key: string]: unknown
}

export type TestNode = {
  type: unknown
  length: number
  props: TestProps
  [index: number]: TestNode
}

/** View a component's return value as a walkable tree. */
export function tree(element: unknown): TestNode {
  return element as TestNode
}

/** `React.Children.toArray` over a node's children, as walkable nodes. */
export function kids(node: TestNode): TestNode[] {
  return Children.toArray(node.props.children as never) as unknown as TestNode[]
}
