import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-10 lg:px-12 lg:py-10">
        <div className="mb-12 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-6">
          <div>
            <p className="text-sm font-medium">Overview</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A clearer picture of your project.
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
            <span
              className="size-1.5 rounded-full bg-zinc-500"
              aria-hidden="true"
            />
            Local analysis · AI optional
          </span>
        </div>
        <ProjectWorkspace />
        <footer className="mt-10 flex flex-wrap justify-between gap-3 text-[11px] text-muted-foreground">
          <p>Static rules for evidence. AI for context.</p>
          <p>Local audit session · Saved history is available when connected</p>
        </footer>
      </div>
    </DashboardLayout>
  );
}
