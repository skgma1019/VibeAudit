import { analyzeProject } from "../lib/analysis/parser";
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from "../types/analysis";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AnalysisWorkerRequest>) => void) | null;
  postMessage(message: AnalysisWorkerResponse): void;
};
const cancelled = new Set<string>();
let activeJobId: string | null = null;
const send = (message: AnalysisWorkerResponse) => scope.postMessage(message);

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "CANCEL_ANALYSIS") {
    cancelled.add(message.jobId);
    if (activeJobId === message.jobId)
      send({ type: "ANALYSIS_CANCELLED", jobId: message.jobId });
    return;
  }
  if (message.type !== "START_ANALYSIS") return;
  if (activeJobId) cancelled.add(activeJobId);
  const { jobId, files, contents } = message;
  activeJobId = jobId;
  send({
    type: "ANALYSIS_STARTED",
    jobId,
    totalFiles: files.filter(
      (file) =>
        file.status === "INCLUDED" &&
        [".ts", ".tsx", ".js", ".jsx", ".sql", ".prisma"].includes(
          file.extension,
        ),
    ).length,
  });
  void analyzeProject(files, contents, {
    isCancelled: () => cancelled.has(jobId),
    onFile: ({ completedFiles, totalFiles, filePath }) =>
      send({
        type: "FILE_ANALYZED",
        jobId,
        completedFiles,
        totalFiles,
        filePath,
      }),
  })
    .then((result) => {
      if (cancelled.has(jobId)) send({ type: "ANALYSIS_CANCELLED", jobId });
      else send({ type: "ANALYSIS_COMPLETED", jobId, result });
    })
    .catch((error: unknown) => {
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        cancelled.has(jobId)
      )
        send({ type: "ANALYSIS_CANCELLED", jobId });
      else
        send({
          type: "ANALYSIS_FAILED",
          jobId,
          message:
            "Project analysis could not be completed. Please select the folder again and retry.",
        });
    })
    .finally(() => {
      cancelled.delete(jobId);
      if (activeJobId === jobId) activeJobId = null;
    });
};
