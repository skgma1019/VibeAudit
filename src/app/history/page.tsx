import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AuditHistory } from "@/components/history/AuditHistory";

export const dynamic = "force-dynamic";
export default function HistoryPage() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-7 px-5 py-8 sm:px-10 lg:px-12 lg:py-10">
        <AuditHistory />
      </div>
    </DashboardLayout>
  );
}
