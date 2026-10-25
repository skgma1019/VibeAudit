"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResult, AnalysisWorkerResponse } from "@/types/analysis";
import type { ProjectFile, ProjectFileContent } from "@/types/project";

export function useProjectAnalysis() {
  const workerRef = useRef<Worker | null>(null);
  const jobRef = useRef(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    filePath: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(() => {
    const worker = workerRef.current;
    if (worker)
      worker.postMessage({
        type: "CANCEL_ANALYSIS",
        jobId: `job-${jobRef.current}`,
      });
    worker?.terminate();
    workerRef.current = null;
    jobRef.current++;
    setBusy(false);
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);
  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  const start = useCallback(
    (files: ProjectFile[], contents: ProjectFileContent[]) => {
      cancel();
      setResult(null);
      setError(null);
      setProgress({ completed: 0, total: 0, filePath: "" });
      setBusy(true);
      const jobId = `job-${jobRef.current}`;
      try {
        const worker = new Worker(
          new URL("../workers/analysis.worker.ts", import.meta.url),
          { type: "module", name: "vibeaudit-static-analysis" },
        );
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
          const response = event.data;
          if (
            response.jobId !== jobId ||
            jobRef.current !== Number(jobId.slice(4))
          )
            return;
          if (response.type === "ANALYSIS_STARTED")
            setProgress({
              completed: 0,
              total: response.totalFiles,
              filePath: "",
            });
          if (response.type === "FILE_ANALYZED")
            setProgress({
              completed: response.completedFiles,
              total: response.totalFiles,
              filePath: response.filePath,
            });
          if (response.type === "ANALYSIS_COMPLETED") {
            setResult(response.result);
            setBusy(false);
            setProgress(null);
            worker.terminate();
            workerRef.current = null;
          }
          if (response.type === "ANALYSIS_FAILED") {
            setError(response.message);
            setBusy(false);
            setProgress(null);
            worker.terminate();
            workerRef.current = null;
          }
          if (response.type === "ANALYSIS_CANCELLED") {
            setBusy(false);
            setProgress(null);
            worker.terminate();
            workerRef.current = null;
          }
        };
        worker.onerror = () => {
          if (workerRef.current === worker) {
            setError("The analysis worker stopped unexpectedly. Please retry.");
            setBusy(false);
            setProgress(null);
            worker.terminate();
            workerRef.current = null;
          }
        };
        worker.postMessage({ type: "START_ANALYSIS", jobId, files, contents });
      } catch {
        setError("The analysis worker could not start in this browser.");
        setBusy(false);
        setProgress(null);
      }
    },
    [cancel],
  );
  return { result, busy, progress, error, start, cancel, clear: cancel };
}
