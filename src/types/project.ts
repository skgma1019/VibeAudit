export type ProjectFileKind =
  "SOURCE" | "CONFIG" | "SCHEMA" | "DOCUMENT" | "UNSUPPORTED";
export type ProjectFileStatus =
  | "INCLUDED"
  | "EXCLUDED"
  | "UNSUPPORTED"
  | "TOO_LARGE"
  | "LIMIT_EXCEEDED"
  | "SENSITIVE"
  | "READ_ERROR"
  | "INVALID_PATH"
  | "DUPLICATE";
export type ExclusionReason =
  | "IGNORED_DIRECTORY"
  | "UNSUPPORTED_TYPE"
  | "SENSITIVE_FILE"
  | "FILE_SIZE"
  | "TOTAL_SIZE"
  | "FILE_COUNT"
  | "READ_FAILED"
  | "BINARY_CONTENT"
  | "INVALID_PATH"
  | "DUPLICATE_PATH";

/** Metadata only: never a native absolute path, File, or source body. */
export interface ProjectFile {
  id: string;
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  kind: ProjectFileKind;
  status: ProjectFileStatus;
  exclusionReason: ExclusionReason | null;
  hasSecretCandidate: boolean;
  redactionCount: number;
}

/** Sanitized text only, held in current page memory. Never persisted. */
export interface ProjectFileContent {
  fileId: string;
  relativePath: string;
  redactedText: string;
}

export type DetectedStack =
  | "JavaScript"
  | "TypeScript"
  | "React"
  | "Next.js"
  | "Node.js"
  | "Tailwind CSS"
  | "Supabase";
export interface ProjectMetadata {
  name: string;
  stack: DetectedStack[];
  warnings: string[];
  totalFiles: number;
  includedFiles: number;
  excludedFiles: number;
  unsupportedFiles: number;
  totalTextBytes: number;
  protectedFiles: number;
}
export interface ProjectSelection {
  metadata: ProjectMetadata;
  files: ProjectFile[];
  contents: ProjectFileContent[];
}
export type SelectionPhase =
  "idle" | "choosing" | "filtering" | "reading" | "preparing";
