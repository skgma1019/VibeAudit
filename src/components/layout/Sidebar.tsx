import {
  Files,
  GitBranch,
  History,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
} from "lucide-react";

const navigation = [
  { label: "Overview", icon: LayoutDashboard, href: "/#view-overview" },
  { label: "Issues", icon: ListChecks, href: "/#view-issues" },
  { label: "Files", icon: Files, href: "/#view-files" },
  { label: "Relations", icon: GitBranch, href: "/#view-relations" },
  { label: "AI Analysis", icon: LockKeyhole, href: "/#view-ai" },
];

export function Sidebar() {
  return (
    <div className="flex h-full flex-col gap-8">
      <div>
        <p className="mb-4 px-3 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Workspace
        </p>
        <nav aria-label="Workspace navigation" className="space-y-1">
          {navigation.map(({ label, icon: Icon, href }) => (
            <a
              key={label}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </a>
          ))}
          <a
            href="/history"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <History className="size-4" aria-hidden="true" />
            History
          </a>
        </nav>
      </div>
      <div className="mt-auto border-t border-border px-3 pt-5">
        <LockKeyhole
          className="mb-3 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-xs leading-5 text-muted-foreground">
          Your code stays yours.
          <br />
          Source code is never stored in the database.
        </p>
        <p className="mt-4 font-mono text-[10px] text-muted-foreground">
          VIBEAUDIT / LOCAL AUDIT SESSION
        </p>
      </div>
    </div>
  );
}
