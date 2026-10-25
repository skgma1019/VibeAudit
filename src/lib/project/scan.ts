import type {
  ProjectFile,
  ProjectFileContent,
  ProjectSelection,
  SelectionPhase,
} from "../../types/project";
import { redactSecrets } from "../security/redact";
import { classifyFile } from "./filter";
import { detectProject } from "./detect";
import { ANALYSIS_LIMITS, FILE_READ_CONCURRENCY } from "./limits";
import { fileExtension, normalizeRelativePath } from "./paths";

export interface LocalProjectFile {
  readonly webkitRelativePath: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  text(): Promise<string>;
}

function ensureActive(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Selection cancelled", "AbortError");
}

function isBinaryText(text: string): boolean {
  if (text.includes("\0")) return true;
  const sample = text.slice(0, 8192);
  const controls =
    sample.match(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\ufffd]/g)?.length ??
    0;
  return sample.length > 0 && controls / sample.length > 0.02;
}

export async function scanProject(
  input: readonly LocalProjectFile[],
  options: {
    signal?: AbortSignal;
    onPhase?: (phase: SelectionPhase) => void;
  } = {},
): Promise<ProjectSelection> {
  const { signal, onPhase } = options;
  ensureActive(signal);
  onPhase?.("filtering");
  const seen = new Set<string>();
  const entries = input
    .map((file, index) => {
      const path = normalizeRelativePath(file.webkitRelativePath);
      // Unsafe paths/names are deliberately replaced, never copied into errors/UI.
      const relativePath = path ?? `[invalid-path-${index + 1}]`;
      const name = relativePath.split("/").at(-1)!;
      const classification = path
        ? classifyFile(path, file.type)
        : {
            kind: "UNSUPPORTED" as const,
            status: "INVALID_PATH" as const,
            exclusionReason: "INVALID_PATH" as const,
          };
      const metadata: ProjectFile = {
        id: `file-${index}`,
        relativePath,
        name,
        extension: fileExtension(name),
        size: Number.isSafeInteger(file.size) && file.size >= 0 ? file.size : 0,
        ...classification,
        hasSecretCandidate: false,
        redactionCount: 0,
      };
      if (!Number.isSafeInteger(file.size) || file.size < 0) {
        metadata.status = "READ_ERROR";
        metadata.exclusionReason = "READ_FAILED";
      }
      return { file, metadata };
    })
    .sort((a, b) =>
      a.metadata.relativePath < b.metadata.relativePath
        ? -1
        : a.metadata.relativePath > b.metadata.relativePath
          ? 1
          : 0,
    );

  let reservedBytes = 0;
  let reservedCount = 0;
  for (const { metadata } of entries) {
    const canonical = metadata.relativePath.toLowerCase();
    if (metadata.status !== "INVALID_PATH" && seen.has(canonical)) {
      metadata.status = "DUPLICATE";
      metadata.exclusionReason = "DUPLICATE_PATH";
    }
    seen.add(canonical);
    if (metadata.status !== "INCLUDED") continue;
    if (metadata.size > ANALYSIS_LIMITS.maxFileBytes) {
      metadata.status = "TOO_LARGE";
      metadata.exclusionReason = "FILE_SIZE";
    } else if (reservedCount >= ANALYSIS_LIMITS.maxFiles) {
      metadata.status = "LIMIT_EXCEEDED";
      metadata.exclusionReason = "FILE_COUNT";
    } else if (
      reservedBytes + metadata.size >
      ANALYSIS_LIMITS.maxTotalTextBytes
    ) {
      metadata.status = "LIMIT_EXCEEDED";
      metadata.exclusionReason = "TOTAL_SIZE";
    } else {
      reservedCount++;
      reservedBytes += metadata.size;
    }
  }

  onPhase?.("reading");
  const contents: ProjectFileContent[] = [];
  const candidates = entries.filter(
    ({ metadata }) => metadata.status === "INCLUDED",
  );
  for (
    let offset = 0;
    offset < candidates.length;
    offset += FILE_READ_CONCURRENCY
  ) {
    ensureActive(signal);
    const batch = await Promise.all(
      candidates
        .slice(offset, offset + FILE_READ_CONCURRENCY)
        .map(async ({ file, metadata }): Promise<ProjectFileContent | null> => {
          try {
            ensureActive(signal);
            const text = await file.text();
            ensureActive(signal);
            if (isBinaryText(text)) {
              metadata.status = "UNSUPPORTED";
              metadata.kind = "UNSUPPORTED";
              metadata.exclusionReason = "BINARY_CONTENT";
              return null;
            }
            const result = redactSecrets(
              text,
              metadata.name.toLowerCase() === ".env.example",
            );
            metadata.hasSecretCandidate = result.hasSecretCandidate;
            metadata.redactionCount = result.redactionCount;
            return {
              fileId: metadata.id,
              relativePath: metadata.relativePath,
              redactedText: result.redactedText,
            };
          } catch {
            ensureActive(signal);
            metadata.status = "READ_ERROR";
            metadata.exclusionReason = "READ_FAILED";
            return null;
          }
        }),
    );
    contents.push(
      ...batch.filter((item): item is ProjectFileContent => item !== null),
    );
    // Yield to paint/cancel input without inventing progress percentages.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  ensureActive(signal);
  onPhase?.("preparing");
  const files = entries.map(({ metadata }) => metadata);
  const validPaths = files
    .filter((file) => file.status !== "INVALID_PATH")
    .map((file) => file.relativePath.split("/"));
  const root = validPaths[0]?.[0];
  const name =
    root && validPaths.every((parts) => parts.length > 1 && parts[0] === root)
      ? root
      : "Selected project";
  const detection = detectProject(files, contents);
  const included = files.filter((file) => file.status === "INCLUDED");
  const unsupportedFiles = files.filter(
    (file) => file.status === "UNSUPPORTED",
  ).length;
  return {
    files,
    contents,
    metadata: {
      name,
      ...detection,
      totalFiles: files.length,
      includedFiles: included.length,
      excludedFiles: files.length - included.length - unsupportedFiles,
      unsupportedFiles,
      totalTextBytes: included.reduce((total, file) => total + file.size, 0),
      protectedFiles: included.filter((file) => file.hasSecretCandidate).length,
    },
  };
}
