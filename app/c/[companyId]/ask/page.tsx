import { AskWorkspace } from "@/components/os/ask-workspace"

export const dynamic = "force-dynamic"

export default async function AskPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  return <AskWorkspace companyId={companyId} />
}
