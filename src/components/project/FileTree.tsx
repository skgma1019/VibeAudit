"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, File, Folder } from "lucide-react";
import type {
  ExclusionReason,
  ProjectFile,
  ProjectFileStatus,
} from "@/types/project";

const labels: Record<ProjectFileStatus, string> = {
  INCLUDED: "Included",
  EXCLUDED: "Excluded",
  UNSUPPORTED: "Unsupported",
  TOO_LARGE: "Too large",
  LIMIT_EXCEEDED: "Limit exceeded",
  SENSITIVE: "Sensitive",
  READ_ERROR: "Read error",
  INVALID_PATH: "Invalid path",
  DUPLICATE: "Duplicate",
};
const reasons: Record<ExclusionReason, string> = {
  IGNORED_DIRECTORY: "Generated or ignored directory",
  UNSUPPORTED_TYPE: "Unsupported file type",
  SENSITIVE_FILE: "Sensitive file; not read",
  FILE_SIZE: "Exceeds 512 KiB per file",
  TOTAL_SIZE: "Would exceed 10 MiB total text",
  FILE_COUNT: "Exceeds 1,000 analysis files",
  READ_FAILED: "Could not read this file",
  BINARY_CONTENT: "Binary or non-text content",
  INVALID_PATH: "Unsafe or invalid path; original hidden",
  DUPLICATE_PATH: "Duplicate normalized path (case insensitive)",
};

interface Directory {
  name: string;
  path: string;
  directories: Map<string, Directory>;
  files: ProjectFile[];
}
function buildTree(files: ProjectFile[]): Directory {
  const root: Directory = {
    name: "",
    path: "",
    directories: new Map(),
    files: [],
  };
  for (const file of files) {
    const parts = file.relativePath.split("/");
    let directory = root;
    for (const name of parts.slice(0, -1)) {
      if (!directory.directories.has(name))
        directory.directories.set(name, {
          name,
          path: `${directory.path}/${name}`,
          directories: new Map(),
          files: [],
        });
      directory = directory.directories.get(name)!;
    }
    directory.files.push(file);
  }
  return root;
}

function DirectoryContents({
  directory,
  depth,
  issueCounts,
  selectedPath,
  onSelect,
}: {
  directory: Directory;
  depth: number;
  issueCounts?: Map<string, number>;
  selectedPath?: string | null;
  onSelect?: (path: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(100);
  const children = [...directory.directories.values(), ...directory.files];
  return (
    <ul className="space-y-1">
      {children.slice(0, visibleCount).map((child) =>
        "directories" in child ? (
          <DirectoryRow
            key={child.path}
            directory={child}
            depth={depth}
            issueCounts={issueCounts}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ) : (
          <li key={child.id}>
            <button
              type="button"
              aria-pressed={selectedPath === child.relativePath}
              onClick={() => onSelect?.(child.relativePath)}
              className={`w-full rounded px-2 py-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${selectedPath === child.relativePath ? "bg-accent" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <File
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-all font-mono text-xs">
                  {child.name}
                </span>
                <span
                  className={`ml-auto rounded border border-border px-2 py-0.5 text-[10px] ${child.status === "INCLUDED" ? "text-muted-foreground" : "text-yellow-300"}`}
                >
                  {labels[child.status]}
                </span>
                {issueCounts && (
                  <span className="rounded border border-rose-500/30 px-2 py-0.5 text-[10px] text-rose-200">
                    {issueCounts.get(child.relativePath) ?? 0} issues
                  </span>
                )}
              </div>
              {child.exclusionReason && (
                <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
                  {reasons[child.exclusionReason]}
                </p>
              )}
              {child.hasSecretCandidate && (
                <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
                  Values masked · {child.redactionCount} replacement(s)
                </p>
              )}
            </button>
          </li>
        ),
      )}
      {children.length > visibleCount && (
        <li>
          <button
            className="rounded px-2 py-2 text-xs text-violet-300 focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => setVisibleCount((count) => count + 100)}
          >
            Show next {Math.min(100, children.length - visibleCount)} entries (
            {children.length - visibleCount} remaining)
          </button>
        </li>
      )}
    </ul>
  );
}

function DirectoryRow({
  directory,
  depth,
  issueCounts,
  selectedPath,
  onSelect,
}: {
  directory: Directory;
  depth: number;
  issueCounts?: Map<string, number>;
  selectedPath?: string | null;
  onSelect?: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  return (
    <li>
      <button
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <Folder
          className="size-3.5 shrink-0 text-violet-400"
          aria-hidden="true"
        />
        <span className="break-all font-mono text-xs">{directory.name}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-border pl-2">
          <DirectoryContents
            directory={directory}
            depth={depth + 1}
            issueCounts={issueCounts}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        </div>
      )}
    </li>
  );
}

export function FileTree({
  files,
  issueCounts,
  selectedPath,
  onSelect,
}: {
  files: ProjectFile[];
  issueCounts?: Map<string, number>;
  selectedPath?: string | null;
  onSelect?: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  return (
    <section
      id="project-files"
      aria-labelledby="files-title"
      className="mb-8 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <h2
        id="files-title"
        tabIndex={-1}
        className="text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Project Files
      </h2>
      <p className="mt-2 mb-5 text-xs leading-5 text-muted-foreground">
        Expand a directory to view files and exclusion reasons. File contents
        are not displayed.
      </p>
      <div className="max-h-[36rem] overflow-auto">
        <DirectoryContents
          directory={tree}
          depth={0}
          issueCounts={issueCounts}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      </div>
    </section>
  );
}
