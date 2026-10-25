import Link from "next/link";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileNavigation } from "./MobileNavigation";

export function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <MobileNavigation />
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ScanLine className="size-6 text-violet-400" aria-hidden="true" />
          VibeAudit
        </Link>
        <span className="ml-2 hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
          PREVIEW
        </span>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" asChild>
          <Link href="/history">History</Link>
        </Button>
        <Button variant="ghost" disabled>
          GitHub<span className="sr-only"> — not available yet</span>
        </Button>
      </div>
    </header>
  );
}
