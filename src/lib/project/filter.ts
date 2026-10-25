import type {
  ProjectFileKind,
  ProjectFileStatus,
  ExclusionReason,
} from "../../types/project";
import { fileExtension } from "./paths";

export const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
]);
export const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".sql",
  ".prisma",
  ".md",
]);
export const SENSITIVE_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".jks",
  ".keystore",
  ".crt",
  ".cer",
  ".der",
]);
export const SENSITIVE_FILE_NAMES = new Set([
  ".npmrc",
  ".pypirc",
  ".netrc",
  "credentials",
  "credentials.json",
  "credentials.yaml",
  "credentials.yml",
  "secrets.json",
  "secrets.yaml",
  "secrets.yml",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
]);

export function isSensitiveFile(path: string): boolean {
  const parts = path.toLowerCase().split("/");
  const name = parts.at(-1) ?? "";
  if (parts.slice(0, -1).some((part) => part === ".ssh" || part === ".aws"))
    return true;
  if (name === ".env.example") return false;
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    SENSITIVE_FILE_NAMES.has(name) ||
    SENSITIVE_EXTENSIONS.has(fileExtension(name)) ||
    /^(?:service[-_]?account(?:[-_]?key)?|google[-_]?credentials|client[-_]?secret|firebase[-_]adminsdk)(?:[._-].*)?\.json$/.test(
      name,
    ) ||
    /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\..+)?$/.test(name)
  );
}

export function classifyFile(
  path: string,
  mimeType = "",
): {
  kind: ProjectFileKind;
  status: ProjectFileStatus;
  exclusionReason: ExclusionReason | null;
} {
  const parts = path.toLowerCase().split("/");
  const name = parts.at(-1) ?? "";
  const extension = fileExtension(name);
  const kind: ProjectFileKind =
    name === ".env.example" ||
    name === "package.json" ||
    name.startsWith("tsconfig.") ||
    /^next\.config\.(?:js|mjs|ts)$/.test(name) ||
    extension === ".json"
      ? "CONFIG"
      : extension === ".sql" || extension === ".prisma"
        ? "SCHEMA"
        : extension === ".md"
          ? "DOCUMENT"
          : [".js", ".jsx", ".ts", ".tsx"].includes(extension)
            ? "SOURCE"
            : "UNSUPPORTED";
  if (isSensitiveFile(path))
    return { kind, status: "SENSITIVE", exclusionReason: "SENSITIVE_FILE" };
  if (parts.slice(0, -1).some((part) => IGNORED_DIRECTORIES.has(part)))
    return { kind, status: "EXCLUDED", exclusionReason: "IGNORED_DIRECTORY" };
  if (
    (!SUPPORTED_EXTENSIONS.has(extension) &&
      name !== ".env.example" &&
      !/^next\.config\.mjs$/.test(name)) ||
    /^(?:image|audio|video|font)\//i.test(mimeType) ||
    /(?:zip|pdf|executable|octet-stream)/i.test(mimeType)
  )
    return {
      kind: "UNSUPPORTED",
      status: "UNSUPPORTED",
      exclusionReason: "UNSUPPORTED_TYPE",
    };
  return { kind, status: "INCLUDED", exclusionReason: null };
}
