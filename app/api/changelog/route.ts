import { NextResponse } from "next/server"
import { getChangelogFeedImpl } from "@/lib/updates/changelog-feed"
import { refuseNonLocal } from "@/lib/http/local-request"

export async function GET(request: Request) {
  const refusal = refuseNonLocal(request)
  if (refusal) return refusal

  try {
    const feed = await getChangelogFeedImpl()
    return NextResponse.json(feed)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load changelog" },
      { status: 500 }
    )
  }
}
