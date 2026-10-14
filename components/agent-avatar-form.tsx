"use client"

import { useState, useRef, type ChangeEvent, type DragEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { setAvatar } from "@/lib/set-avatar"
import { removeAvatar } from "@/lib/remove-avatar"
import { processAvatarImage } from "@/lib/process-avatar-image"
import { glyphHue } from "@/lib/glyph-hue"
import { Upload, Trash2, Camera, Check, Loader2, Link2 } from "lucide-react"

export const AVATAR_BLURB = "Add a picture for this company. Just for your own dashboard, purely for fun."

export function AgentAvatarForm({
  agentId,
  currentUrl,
  companyName,
}: {
  agentId: string
  currentUrl: string | null
  companyName?: string
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [previewUrl, setPreviewUrl] = useState<string>(currentUrl ?? "")
  const [url, setUrl] = useState<string>(currentUrl ?? "")
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const activeUrl = previewUrl || currentUrl

  async function handleFile(file: File) {
    setMessage(null)
    setSuccess(null)
    setPending(true)

    const processed = await processAvatarImage(file)
    if (!processed.ok) {
      setMessage(processed.error)
      setPending(false)
      return
    }

    setPreviewUrl(processed.dataUrl)
    setUrl(processed.dataUrl)

    const result = await setAvatar(agentId, processed.dataUrl)
    setPending(false)

    if (result.ok) {
      setSuccess("Logo updated")
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      void handleFile(file)
    }
    // Clear the input value so selecting the same file again triggers change
    e.target.value = ""
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      void handleFile(file)
    }
  }

  async function handleSaveUrl() {
    if (!url.trim()) return
    setMessage(null)
    setSuccess(null)
    setPending(true)

    const result = await setAvatar(agentId, url.trim())
    setPending(false)

    if (result.ok) {
      setPreviewUrl(url.trim())
      setSuccess("Logo updated")
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  async function handleRemove() {
    setMessage(null)
    setSuccess(null)
    setPending(true)

    const result = await removeAvatar(agentId)
    setPending(false)

    if (result.ok) {
      setPreviewUrl("")
      setUrl("")
      setSuccess("Logo removed")
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  const initialLetter = (companyName || agentId).charAt(0).toUpperCase()

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {/* Clickable & drop-target avatar preview */}
        <div
          onClick={() => !pending && fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          title="Click or drop an image file to update logo"
          className={`group relative flex size-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-2 transition-all ${
            isDragging
              ? "ring-primary ring-offset-2 scale-105"
              : "ring-border hover:ring-primary/60 hover:opacity-90"
          }`}
        >
          {activeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo
            <img
              src={activeUrl}
              alt={companyName ? `${companyName} logo` : "Company logo"}
              className="size-full object-cover"
            />
          ) : (
            <span
              className="flex size-full items-center justify-center font-display text-sm font-bold text-white"
              style={{ background: glyphHue(agentId) }}
              aria-hidden="true"
            >
              {initialLetter}
            </span>
          )}

          {/* Hover overlay with camera icon */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="size-4 text-white" aria-hidden="true" />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/*"
              className="hidden"
              onChange={handleFileInputChange}
            />

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className="h-8 text-xs font-medium"
            >
              {pending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 size-3.5" />
              )}
              {pending ? "Saving…" : activeUrl ? "Change logo" : "Upload logo"}
            </Button>

            {activeUrl && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleRemove}
                disabled={pending}
                className="h-8 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="mr-1 size-3.5" />
                Remove
              </Button>
            )}

            <button
              type="button"
              onClick={() => setShowUrlInput((prev) => !prev)}
              className="text-[11px] text-muted-foreground transition-colors hover:text-foreground inline-flex items-center gap-1"
            >
              <Link2 className="size-3" />
              {showUrlInput ? "Hide URL" : "Paste URL"}
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            PNG, JPEG, WebP, or SVG. Click or drop an image here.
          </p>
        </div>
      </div>

      {showUrlInput && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://... or data:image/..."
            className="h-8 text-xs flex-1"
            disabled={pending}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSaveUrl}
            disabled={pending || !url.trim()}
            className="h-8 text-xs"
          >
            Save URL
          </Button>
        </div>
      )}

      {success && (
        <p className="flex items-center gap-1 text-xs text-success">
          <Check className="size-3" />
          {success}
        </p>
      )}

      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  )
}
