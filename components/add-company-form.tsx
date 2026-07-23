"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { registerCompany } from "@/lib/register-company"

export function AddCompanyForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [rootPath, setRootPath] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit() {
    setPending(true)
    setMessage(null)
    const result = await registerCompany(name, rootPath)
    setPending(false)
    if (result.ok) {
      setName("")
      setRootPath("")
      setMessage(`Registered "${result.company.name}"`)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div className="space-y-2 rounded border p-4">
      <h2 className="text-sm font-medium">Add a company</h2>
      <div className="space-y-1">
        <label className="text-sm">Name</label>
        <Textarea rows={1} value={name} onChange={(e) => setName(e.target.value)} placeholder="Second Co" />
      </div>
      <div className="space-y-1">
        <label className="text-sm">Local directory path</label>
        <Textarea
          rows={1}
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          placeholder="/Users/you/AI-Native/second-co"
        />
      </div>
      <Button size="sm" onClick={handleSubmit} disabled={pending || !name || !rootPath}>
        {pending ? "Adding…" : "Add company"}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
