import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { savePostImageImpl } from "./save-post-image-impl"
import { CANVA_IMAGE_HOSTS } from "./canva-tools"

const HOST = "export.canva.test"
const post = (url: string) => `---\ntype: post\nstatus: draft\ntitle: T\nimage_url: ${url}\nimage_status: ok\n---\n\n## Caption\nHi\n`
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
const okFetch = (url = `https://${HOST}/x.png`, type = "image/png", body = png) =>
  (async () => new Response(body, { status: 200, headers: { "content-type": type } }) as Response & { url: string }) as unknown as typeof fetch
let root: string

describe("savePostImageImpl", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "img-"))
    execFileSync("git", ["init", "-q"], { cwd: root })
    fs.mkdirSync(path.join(root, "notes/content/posts"), { recursive: true })
  })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (url: string) => fs.writeFileSync(path.join(root, "notes/content/posts/a.md"), post(url))

  it("saves a Canva PNG next to the posts and commits it", async () => {
    write(`https://${HOST}/x.png`)
    const r = await savePostImageImpl(root, "a.md", okFetch(), undefined, [HOST])
    expect(r).toMatchObject({ ok: true, image: "a.png" })
    expect(fs.existsSync(path.join(root, "notes/content/images/a.png"))).toBe(true)
    expect(execFileSync("git", ["log", "--oneline"], { cwd: root }).toString()).toContain("post image")
  })

  it.each([
    ["http, not https", `http://${HOST}/x.png`],
    ["another host", "https://evil.example/x.png"],
  ])("refuses %s without fetching", async (_label, url) => {
    write(url)
    let fetched = false
    const r = await savePostImageImpl(root, "a.md", (async () => { fetched = true; return new Response(png) }) as unknown as typeof fetch, undefined, [HOST])
    expect(r.ok).toBe(false)
    expect(fetched).toBe(false)
  })

  it("refuses a redirect that lands on another host without fetching evil URL", async () => {
    write(`https://${HOST}/x.png`)
    let callCount = 0
    let evilFetched = false
    const fakeFetch = (async (url: string) => {
      callCount++
      if (url.includes("evil")) evilFetched = true
      if (url.includes("evil")) return new Response(null, { status: 404 })
      return new Response(null, { status: 302, headers: { location: "https://evil.example/x.png" } })
    }) as unknown as typeof fetch
    const r = await savePostImageImpl(root, "a.md", fakeFetch, undefined, [HOST])
    expect(r.ok).toBe(false)
    expect(evilFetched).toBe(false)
    expect(callCount).toBe(1)
    expect(fs.existsSync(path.join(root, "notes/content/images"))).toBe(false)
  })

  it("allows redirect to another path on same allowed host", async () => {
    write(`https://${HOST}/x.png`)
    let callCount = 0
    const fakeFetch = (async (url: string) => {
      callCount++
      if (callCount === 1) return new Response(null, { status: 302, headers: { location: `https://${HOST}/redirected.png` } })
      return new Response(png, { status: 200, headers: { "content-type": "image/png" } })
    }) as unknown as typeof fetch
    const r = await savePostImageImpl(root, "a.md", fakeFetch, undefined, [HOST])
    expect(r.ok).toBe(true)
    expect(callCount).toBe(2)
    expect(fs.existsSync(path.join(root, "notes/content/images/a.png"))).toBe(true)
  })

  it("refuses image with oversized content-length header without reading body", async () => {
    write(`https://${HOST}/x.png`)
    let bodyCalled = false
    const fakeFetch = (async () => {
      const res = new Response(null, { status: 200, headers: { "content-type": "image/png", "content-length": String(15 * 1024 * 1024 + 1) } })
      Object.defineProperty(res, "body", {
        get() {
          bodyCalled = true
          return null
        }
      })
      return res
    }) as unknown as typeof fetch
    const r = await savePostImageImpl(root, "a.md", fakeFetch, undefined, [HOST])
    expect(r.ok).toBe(false)
    expect(bodyCalled).toBe(false)
  })

  it("refuses streamed image over 15 MB without content-length header", async () => {
    write(`https://${HOST}/x.png`)
    const fakeFetch = (async () => {
      const chunks: Uint8Array[] = []
      let totalEnqueued = 0
      const chunkSize = 1024 * 1024
      while (totalEnqueued < 15 * 1024 * 1024 + 1) {
        const chunk = new Uint8Array(chunkSize)
        chunks.push(chunk)
        totalEnqueued += chunkSize
      }
      let chunkIdx = 0
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (chunkIdx < chunks.length) {
            controller.enqueue(chunks[chunkIdx]!)
            chunkIdx++
          } else {
            controller.close()
          }
        }
      })
      const res = new Response(body, { status: 200, headers: { "content-type": "image/png" } })
      return res
    }) as unknown as typeof fetch
    const r = await savePostImageImpl(root, "a.md", fakeFetch, undefined, [HOST])
    expect(r.ok).toBe(false)
    expect(r.message).toBe("The image is larger than 15 MB, so it wasn't saved.")
    expect(fs.existsSync(path.join(root, "notes/content/images"))).toBe(false)
  })

  it("refuses something that is not an image, or is over 15 MB", async () => {
    write(`https://${HOST}/x.png`)
    expect((await savePostImageImpl(root, "a.md", okFetch(undefined, "text/html"), undefined, [HOST])).ok).toBe(false)
    expect((await savePostImageImpl(root, "a.md", okFetch(undefined, "image/png", new Uint8Array(15 * 1024 * 1024 + 1)), undefined, [HOST])).ok).toBe(false)
  })

  it("refuses an unsafe file name", async () => {
    expect((await savePostImageImpl(root, "../../HANDOFF.md", okFetch(), undefined, [HOST])).ok).toBe(false)
  })

  it("refuses a valid https URL when allowedHosts defaults to empty CANVA_IMAGE_HOSTS", async () => {
    // Test that with the real CANVA_IMAGE_HOSTS (currently empty), even a valid-looking https URL is refused
    write("https://export.canva.test/x.png")
    let fetched = false
    const r = await savePostImageImpl(root, "a.md", (async () => { fetched = true; return new Response(png) }) as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    expect(fetched).toBe(false)
  })
})
