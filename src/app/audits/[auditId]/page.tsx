import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AuditDetail } from "@/components/history/AuditDetail";

export const dynamic = "force-dynamic";
export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-7 px-5 py-8 sm:px-10 lg:px-12 lg:py-10">
        <AuditDetail auditId={auditId} />
      </div>
    </DashboardLayout>
  );
}
