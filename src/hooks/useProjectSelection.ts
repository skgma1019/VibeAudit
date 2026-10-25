"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scanProject } from "@/lib/project/scan";
import type {
  ProjectFileContent,
  ProjectSelection,
  SelectionPhase,
} from "@/types/project";

export function useProjectSelection() {
  const [project, setProject] = useState<Omit<
    ProjectSelection,
    "contents"
  > | null>(null);
  const [phase, setPhase] = useState<SelectionPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  // Keep only sanitized text in session memory, outside UI metadata state.
  const contents = useRef<ProjectFileContent[]>([]);

  useEffect(
    () => () => {
      controller.current?.abort();
      contents.current = [];
    },
    [],
  );

  function clearProject() {
    controller.current?.abort();
    controller.current = null;
    contents.current = [];
    setProject(null);
    setError(null);
    setPhase("idle");
  }

  function beginChoosing() {
    clearProject();
    setPhase("choosing");
  }

  async function selectFiles(files: File[]) {
    clearProject();
    if (!files.length) {
      setError(
        "No files were provided. Empty folders cannot be prepared; please choose a project containing files.",
      );
      return;
    }
    const current = new AbortController();
    controller.current = current;
    try {
      const result = await scanProject(files, {
        signal: current.signal,
        onPhase: (next) => {
          if (!current.signal.aborted) setPhase(next);
        },
      });
      if (current.signal.aborted) return;
      contents.current = result.contents;
      setProject({ metadata: result.metadata, files: result.files });
    } catch {
      if (!current.signal.aborted)
        setError(
          "This folder could not be prepared. Please select it again or choose another folder.",
        );
    } finally {
      if (!current.signal.aborted) {
        controller.current = null;
        setPhase("idle");
      }
    }
  }

  return {
    project,
    phase,
    error,
    selectFiles,
    getContents: useCallback(() => contents.current, []),
    clearProject,
    beginChoosing,
    cancelChoosing: () => setPhase("idle"),
  };
}
