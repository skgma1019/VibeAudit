export const MAX_PATH_LENGTH = 1024;
export const MAX_PATH_SEGMENT_LENGTH = 255;

/** A null result must never be replaced with/displayed as the unsafe input. */
export function normalizeRelativePath(input: string): string | null {
  if (
    !input ||
    input.length > MAX_PATH_LENGTH ||
    /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(input)
  )
    return null;
  const slashPath = input.replace(/\\/g, "/");
  if (
    /^[a-z]:/i.test(slashPath) ||
    slashPath.startsWith("//") ||
    slashPath.includes(":")
  )
    return null;
  const parts = slashPath
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== ".");
  if (
    !parts.length ||
    parts.some((part) => part === ".." || part.length > MAX_PATH_SEGMENT_LENGTH)
  )
    return null;
  return parts.join("/");
}

export function fileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index).toLowerCase() : "";
}
