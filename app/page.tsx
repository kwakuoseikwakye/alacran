import { WorkspaceView } from "@/components/os/workspace-view"

export const dynamic = "force-dynamic"

/** The company picker. The workspace body lives in `WorkspaceView` so
 *  `/c/[companyId]/files` can mount the same thing scoped to one company. */
export default function WorkspacePage() {
  return <WorkspaceView />
}
