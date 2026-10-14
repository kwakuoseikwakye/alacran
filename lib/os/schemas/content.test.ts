import { describe, it, expect } from "vitest"
import {
  ContentItemSchema,
  ContentItemsFileSchema,
} from "./content"

describe("ContentItemSchema", () => {
  it("validates a content item record", () => {
    const fixture = {
      id: "post-101",
      title: "Introducing Alacrán OS Shell",
      status: "published",
      type: "article",
      channel: "blog",
      author: "human",
      publish_date: "2026-09-10",
      url: "https://alacran.ai/blog/os-shell",
      summary: "Overview of local-first OS architecture and company memory.",
      provenance: [
        { claim: "drafted from release notes", said_by: "agent", said_on: "2026-09-10", source: "git" },
      ],
    }
    const parsed = ContentItemSchema.parse(fixture)
    expect(parsed.id).toBe("post-101")
    expect(parsed.status).toBe("published")
    expect(parsed.channel).toBe("blog")
  })

  it("fails on invalid status", () => {
    const fixture = {
      id: "bad",
      title: "Bad Post",
      status: "nonexistent",
      type: "post",
      channel: "x",
      author: "agent",
    }
    expect(() => ContentItemSchema.parse(fixture)).toThrow()
  })

  it("validates content items file schema", () => {
    const file = {
      schema_version: 1,
      records: [
        {
          id: "tweet-1",
          title: "Launch tweet",
          status: "scheduled",
          type: "post",
          channel: "x",
          author: "agent",
          publish_date: "2026-09-11",
        },
      ],
    }
    const parsed = ContentItemsFileSchema.parse(file)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0].status).toBe("scheduled")
  })
})
