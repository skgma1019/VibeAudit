/** Enforced before file reads; adjust only after performance measurements. */
export const ANALYSIS_LIMITS = {
  maxFileBytes: 512 * 1024,
  maxTotalTextBytes: 10 * 1024 * 1024,
  maxFiles: 1_000,
} as const;

export const FILE_READ_CONCURRENCY = 4;
