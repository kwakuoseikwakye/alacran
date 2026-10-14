"use client"

import { useCallback } from "react"
import { Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { askCompany } from "@/lib/ask-company"
import { useVoiceAsk } from "@/components/use-voice-ask"
import { AskPanel } from "@/components/ask-panel"

export const VOICE_ASSISTANT_BLURB =
  "Ask your company something out loud and get a spoken answer back, grounded in its own notes, decisions and skills. Read-only — nothing here is ever written or changed."

/**
 * Ask one company a question, from its own card.
 *
 * The state machine and the panel are both shared with the assistant page
 * (`useVoiceAsk`, `AskPanel`) — this file is now only the Sheet around them and
 * the choice of which server action to ask with.
 */
export function VoiceAssistantButton({ agentId }: { agentId: string }) {
  const ask = useCallback((question: string) => askCompany(agentId, question), [agentId])
  const voice = useVoiceAsk(ask)

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) voice.reset()
      }}
    >
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <Mic className="h-4 w-4" />
          Ask your company
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Ask your company</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <AskPanel voice={voice} intro={VOICE_ASSISTANT_BLURB} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
