import type { DetectedStack } from "@/types/project";

export function StackBadge({ stack }: { stack: DetectedStack }) {
  return (
    <span className="rounded-md border border-border bg-background px-2.5 py-1 font-mono text-xs text-foreground">
      {stack}
    </span>
  );
}
