import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock("@/lib/company-commands/commit-company-command-result", () => ({ commitCompanyCommandResult: vi.fn() }))
vi.mock("@/lib/company-commands/request-revision", () => ({ requestRevision: vi.fn() }))
vi.mock("@/lib/content-social/actions", () => ({ discardPost: vi.fn(), markPostPosted: vi.fn(), savePostImage: vi.fn() }))

import { PostCard } from "./post-card"
import { parsePost } from "@/lib/content-social/posts"

describe("PostCard without a Canva connection", () => {
  it("says to make the picture in Canva and links there, instead of 'No image yet.'", () => {
    const post = parsePost("a.md", "---\ntitle: Brunch\nimage_status: none\n---\n## Caption\nHi\n", "waiting")
    const html = renderToStaticMarkup(<PostCard post={post} agentId="acme" />)
    expect(html).toContain("Make the picture in Canva, then post it with this caption.")
    expect(html).not.toContain("No image yet.")
    expect(html).toContain('href="https://www.canva.com/"')
    expect(html).toContain('target="_blank"')
  })
})
