import { GuideProposalPreview } from "@/components/os/guide/guide-proposal-preview"
import { sampleProposal } from "@/lib/guide/sample"

export const dynamic = "force-dynamic"

/** A sample of the Approvals "Guide update" card, so it can be seen before any company has a guide to update. */
export default function GuideUpdatePreviewPage() {
  return (
    <>
      <header className="dash-topbar a-rise">
        <div>
          <p className="eyebrow">Preview</p>
          <h1>Approvals</h1>
          <p>This is how a guide update waits here for your yes. The changes below are made up.</p>
        </div>
      </header>
      <div className="dash-content tasks-page">
        <GuideProposalPreview proposal={sampleProposal()} />
      </div>
    </>
  )
}
