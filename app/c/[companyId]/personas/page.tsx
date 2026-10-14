import { PageHeader } from "@/components/os/dashboard/page-header";
import { Badge } from "@/components/os/terminal";
import { PersonasViewer } from "@/components/os/personas/personas-viewer";
import { readPersonas } from "@/lib/os/personas/read";

export const dynamic = "force-dynamic";

export default async function PersonasPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const personas = await readPersonas(companyId);

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="Example businesses"
        subtext="How other kinds of businesses run with Alacrán. Nothing here changes your company."
        right={<Badge tone="accent">{personas.length} examples</Badge>}
      />
      <PersonasViewer personas={personas} />
    </div>
  );
}
