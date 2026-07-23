"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { setAvatar } from "@/lib/set-avatar"
import { removeAvatar } from "@/lib/remove-avatar"

export function AgentAvatarForm({ agentId, currentUrl }: { agentId: string; currentUrl: string | null }) {
  const router = useRouter()
  const [url, setUrl] = useState(currentUrl ?? "")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSave() {
    setPending(true)
    const result = await setAvatar(agentId, url)
    setPending(false)
    if (result.ok) {
      setMessage(null)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  async function handleRemove() {
    setPending(true)
    const result = await removeAvatar(agentId)
    setPending(false)
    if (result.ok) {
      setUrl("")
      setMessage(null)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div className="space-y-1">
      <Textarea
        rows={1}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://... or data:image/..."
        className="text-xs"
      />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleSave} disabled={pending || !url}>
          Save avatar
        </Button>
        {currentUrl && (
          <Button size="sm" variant="outline" onClick={handleRemove} disabled={pending}>
            Remove
          </Button>
        )}
      </div>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  )
}
