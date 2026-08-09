import { describe, it, expect } from "vitest"
import { buildCheckNotionPrefetch } from "./check-notion"
import type { PrefetchContext, PrefetchExecFileFn, PrefetchFetchFn } from "./types"

const execFn: PrefetchExecFileFn = async () => ({ stdout: "", stderr: "" })

function ctx(overrides: Partial<PrefetchContext> = {}): PrefetchContext {
  return { agentRootPath: "/company", fieldValues: {}, execFn, ...overrides }
}

function fakeFetch(handler: (url: string, init: { headers: Record<string, string>; body: string }) => { status: number; body: unknown }): PrefetchFetchFn {
  return async (url, init) => {
    const { status, body } = handler(url, init)
    return { status, ok: status >= 200 && status < 300, json: async () => body }
  }
}

describe("buildCheckNotionPrefetch", () => {
  it("refuses when the company has no .env at all", async () => {
    const readFileFn = async () => {
      throw new Error("ENOENT")
    }
    const result = await buildCheckNotionPrefetch(ctx({ readFileFn }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("api-connect")
  })

  it("refuses when .env exists but has no NOTION_TOKEN", async () => {
    const readFileFn = async () => "SLACK_BOT_TOKEN=xoxb-123\n"
    const result = await buildCheckNotionPrefetch(ctx({ readFileFn }))
    expect(result.ok).toBe(false)
  })

  it("sends the real Notion search request shape: Bearer auth, Notion-Version header, sorted search body", async () => {
    const readFileFn = async () => "NOTION_TOKEN=secret_real\n"
    let seenUrl = ""
    let seenHeaders: Record<string, string> = {}
    let seenBody: unknown
    const fetchFn = fakeFetch((url, init) => {
      seenUrl = url
      seenHeaders = init.headers
      seenBody = JSON.parse(init.body)
      return { status: 200, body: { results: [] } }
    })
    await buildCheckNotionPrefetch(ctx({ readFileFn, fetchFn }))
    expect(seenUrl).toBe("https://api.notion.com/v1/search")
    expect(seenHeaders.Authorization).toBe("Bearer secret_real")
    expect(seenHeaders["Notion-Version"]).toBeTruthy()
    expect(seenBody).toEqual({ sort: { direction: "descending", timestamp: "last_edited_time" }, page_size: 10 })
  })

  it("reports nothing-shared distinctly from a real empty account", async () => {
    const readFileFn = async () => "NOTION_TOKEN=secret_real\n"
    const fetchFn = fakeFetch(() => ({ status: 200, body: { results: [] } }))
    const result = await buildCheckNotionPrefetch(ctx({ readFileFn, fetchFn }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("no pages or databases are shared")
  })

  it("formats a page result using its title-typed property", async () => {
    const readFileFn = async () => "NOTION_TOKEN=secret_real\n"
    const fetchFn = fakeFetch(() => ({
      status: 200,
      body: {
        results: [
          {
            object: "page",
            url: "https://notion.so/abc123",
            last_edited_time: "2026-08-01T12:00:00.000Z",
            properties: { Name: { type: "title", title: [{ plain_text: "Q3 roadmap" }] } },
          },
        ],
      },
    }))
    const result = await buildCheckNotionPrefetch(ctx({ readFileFn, fetchFn }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("[page] Q3 roadmap — edited 2026-08-01 — https://notion.so/abc123")
  })

  it("formats a database result using its own top-level title array", async () => {
    const readFileFn = async () => "NOTION_TOKEN=secret_real\n"
    const fetchFn = fakeFetch(() => ({
      status: 200,
      body: {
        results: [
          {
            object: "database",
            url: "https://notion.so/db456",
            last_edited_time: "2026-07-15T00:00:00.000Z",
            title: [{ plain_text: "Client tracker" }],
          },
        ],
      },
    }))
    const result = await buildCheckNotionPrefetch(ctx({ readFileFn, fetchFn }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("[database] Client tracker — edited 2026-07-15 — https://notion.so/db456")
  })

  it("falls back to (untitled) rather than throwing when a result has no title anywhere", async () => {
    const readFileFn = async () => "NOTION_TOKEN=secret_real\n"
    const fetchFn = fakeFetch(() => ({
      status: 200,
      body: { results: [{ object: "page", url: "https://notion.so/x", last_edited_time: "2026-01-01T00:00:00.000Z" }] },
    }))
    const result = await buildCheckNotionPrefetch(ctx({ readFileFn, fetchFn }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("(untitled)")
  })

  it("distinguishes an invalid token (401) from a permission error (403)", async () => {
    const readFileFn = async () => "NOTION_TOKEN=secret_real\n"
    const unauthorized = await buildCheckNotionPrefetch(
      ctx({ readFileFn, fetchFn: fakeFetch(() => ({ status: 401, body: {} })) })
    )
    expect(unauthorized.ok).toBe(false)
    if (!unauthorized.ok) expect(unauthorized.message).toContain("invalid or expired")

    const forbidden = await buildCheckNotionPrefetch(
      ctx({ readFileFn, fetchFn: fakeFetch(() => ({ status: 403, body: {} })) })
    )
    expect(forbidden.ok).toBe(false)
    if (!forbidden.ok) expect(forbidden.message).toContain("permission")
  })

  it("refuses cleanly when the network call itself throws", async () => {
    const readFileFn = async () => "NOTION_TOKEN=secret_real\n"
    const fetchFn: PrefetchFetchFn = async () => {
      throw new Error("getaddrinfo ENOTFOUND api.notion.com")
    }
    const result = await buildCheckNotionPrefetch(ctx({ readFileFn, fetchFn }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("Could not reach the Notion API")
  })
})
