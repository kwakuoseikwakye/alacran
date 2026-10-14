"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { commitCompanyCommandResult } from "@/lib/company-commands/commit-company-command-result"
import { requestRevision } from "@/lib/company-commands/request-revision"
import { discardPost, markPostPosted, savePostImage } from "@/lib/content-social/actions"
import type { Post } from "@/lib/content-social/posts"
import { SAVE_IMAGE_ON_VIEW } from "@/lib/content-social/canva-tools"

export function PostCard({ post, agentId }: { post: Post; agentId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Success notes ("Copied.") read neutral; `message` is for problems.
  const [note, setNote] = useState<string | null>(null)
  const [revising, setRevising] = useState(false)
  const [feedback, setFeedback] = useState("")
  const savedRef = useRef(false)

  // Only when step zero found Canva's links die within an hour: keep the image
  // the moment the member sees it, before approval. Ref-guarded (Strict Mode).
  useEffect(() => {
    if (!SAVE_IMAGE_ON_VIEW || post.state !== "waiting" || post.imageStatus !== "ok" || post.localImage || savedRef.current) return
    savedRef.current = true
    void savePostImage(agentId, post.fileName)
  }, [agentId, post])

  async function act(fn: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true)
    setMessage(null)
    setNote(null)
    try {
      const r = await fn()
      setMessage(r.ok ? null : r.message)
      if (r.ok) router.refresh()
    } catch (err) {
      setMessage(err instanceof Error && err.message ? `Something went wrong: ${err.message}` : "Something went wrong. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const approve = () => act(async () => {
    const r = await commitCompanyCommandResult("make-posts", post.relativePath, agentId, post.text)
    if (!r.committed) return { ok: false, message: r.message }
    if (post.imageStatus === "ok" && !post.localImage) {
      const img = await savePostImage(agentId, post.fileName)
      if (!img.ok) return { ok: true, message: img.message }
    }
    return { ok: true, message: r.message }
  })
  const ask = () => act(async () => {
    const r = await requestRevision("make-posts", agentId, { feedback, outputPath: post.relativePath, expectedText: post.text })
    if (r.started) { setRevising(false); setFeedback("") }
    return { ok: r.started, message: r.message }
  })

  const copyCaption = () => {
    // Through a promise so a missing clipboard API lands in the failure branch too.
    Promise.resolve().then(() => navigator.clipboard.writeText(`${post.caption}\n\n${post.hashtags}`.trim())).then(
      () => { setMessage(null); setNote("Copied.") },
      () => { setNote(null); setMessage("Couldn't copy — select the text instead.") }
    )
  }

  const imageSrc = post.localImage
    ? `/api/content-social/image?company=${encodeURIComponent(agentId)}&file=${encodeURIComponent(post.localImage)}`
    : post.imageStatus === "ok" ? post.imageUrl : undefined

  return (
    <article className="post-card" aria-label={post.title}>
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by our own dynamic route or a Canva export link, not a static/local asset next/image can optimize
        <img src={imageSrc} alt={post.altText || post.title} />
      ) : (
        <div className="post-card-noimage">
          {post.imageStatus === "failed" ? `The image couldn't be made. ${post.imageError ?? ""}` : post.imageStatus === "none" ? "Make the picture in Canva, then post it with this caption." : "No image yet."}
          {(post.canvaDesignUrl || post.imageStatus === "none") && (
            <a href={post.canvaDesignUrl ?? "https://www.canva.com/"} target="_blank" rel="noreferrer" onClick={post.imageStatus === "none" ? copyCaption : undefined}>Open in Canva</a>
          )}
        </div>
      )}
      <div className="post-card-body">
        <h3>{post.title}</h3>
        <p className="post-card-meta">Instagram{post.suggestedTime ? ` · ${post.suggestedTime}` : ""}{post.postedOn ? ` · posted ${post.postedOn}` : ""}</p>
        {post.problems.map((p) => <p key={p} className="post-card-problem">{p}</p>)}
        <p className="post-card-caption">{post.caption}</p>
        {post.hashtags && <p className="post-card-tags">{post.hashtags}</p>}

        {post.state === "waiting" && (
          <div className="post-card-actions">
            <button disabled={busy} onClick={approve}>Approve</button>
            <button disabled={busy} onClick={() => setRevising((v) => !v)}>Ask for changes</button>
            <button disabled={busy} onClick={() => act(() => discardPost(agentId, post.fileName))}>Discard</button>
          </div>
        )}
        {revising && (
          <div className="post-card-revise">
            <textarea aria-label="What should change?" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What should change?" />
            <button disabled={busy || !feedback.trim()} onClick={ask}>Send</button>
          </div>
        )}
        {post.state === "ready" && (
          <div className="post-card-actions">
            <button onClick={copyCaption}>Copy caption</button>
            {imageSrc && <a href={imageSrc} download={post.localImage ?? `${post.fileName.replace(/\.md$/, "")}.png`}>Download image</a>}
            {post.canvaDesignUrl && <a href={post.canvaDesignUrl} target="_blank" rel="noreferrer">Open in Canva</a>}
            {post.imageStatus === "ok" && !post.localImage && (
              <>
                <span className="post-card-message">The picture hasn&apos;t been saved to this computer yet.</span>
                <button disabled={busy} onClick={() => act(() => savePostImage(agentId, post.fileName))}>Save image</button>
              </>
            )}
            <a href="https://www.instagram.com/" target="_blank" rel="noreferrer">Open Instagram</a>
            <button disabled={busy} onClick={() => act(() => markPostPosted(agentId, post.fileName))}>Mark as posted</button>
          </div>
        )}
        {message && <p role="status" className="post-card-message">{message}</p>}
        {note && <p role="status" className="post-card-note">{note}</p>}
      </div>
    </article>
  )
}
