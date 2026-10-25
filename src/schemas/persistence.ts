import { z } from "zod";

const uuid = z.string().uuid();
const relativePath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !/^[A-Za-z]:/.test(value) &&
      !value.split("/").some((part) => part === ".." || part === ".") &&
      value.split("/").every((part) => {
        const lower = part.toLowerCase();
        return (
          !(lower.startsWith(".env") && lower !== ".env.example") &&
          !/^(?:id_rsa|id_ed25519|credentials)(?:\.|$)/.test(lower) &&
          !/\.(?:pem|key|p12|pfx|crt|cer)$/.test(lower)
        );
      }),
    "Expected a safe relative path",
  );
const location = z.object({
  filePath: relativePath,
  line: z.number().int().positive().max(10_000_000),
  column: z.number().int().positive().max(10_000_000),
});
const score = z.number().min(0).max(100);

export const persistedAuditSchema = z
  .object({
    requestId: uuid,
    project: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("existing"), projectId: uuid }),
      z.object({
        mode: z.literal("new"),
        name: z.string().trim().min(1).max(120),
        framework: z.string().max(80).nullable(),
        stack: z.array(z.string().max(40)).max(16),
      }),
    ]),
    audit: z
      .object({
        scores: z.object({
          overall: score,
          grade: z.enum(["A", "B", "C", "D", "F"]),
          categories: z.object({
            DATA_INTEGRITY: score,
            CONSISTENCY: score,
            SECURITY: score,
            STRUCTURE: score,
            DEPENDENCY: score,
          }),
        }),
        coverage: z.object({
          DATA_INTEGRITY: z.enum(["FULL", "PARTIAL", "LIMITED"]),
          CONSISTENCY: z.enum(["FULL", "PARTIAL", "LIMITED"]),
          SECURITY: z.enum(["FULL", "PARTIAL", "LIMITED"]),
          STRUCTURE: z.enum(["FULL", "PARTIAL", "LIMITED"]),
          DEPENDENCY: z.enum(["FULL", "PARTIAL", "LIMITED"]),
        }),
        fileCount: z.number().int().min(0).max(1000),
        analyzedFileCount: z.number().int().min(0).max(1000),
        ruleVersion: z.string().min(1).max(80),
        scoreVersion: z.string().min(1).max(80),
        aiStatus: z.enum(["IDLE", "COMPLETE", "PARTIAL", "FAILED", "SKIPPED"]),
        summary: z
          .object({
            overview: z.string().max(2000),
            strengths: z.array(z.string().max(500)).max(20),
            topPriorities: z.array(z.string().max(500)).max(20),
          })
          .strict()
          .nullable(),
        issues: z
          .array(
            z
              .object({
                id: uuid,
                fingerprint: z.string().min(1).max(512),
                ruleId: z.string().min(1).max(128),
                detectionKind: z.enum(["DETERMINISTIC", "HEURISTIC"]),
                category: z.enum([
                  "DATA_INTEGRITY",
                  "CONSISTENCY",
                  "SECURITY",
                  "STRUCTURE",
                  "DEPENDENCY",
                ]),
                severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
                title: z.string().min(1).max(256),
                description: z.string().min(1).max(1024),
                evidence: z.string().min(1).max(1024),
                suggestion: z.string().min(1).max(1024),
                locations: z.array(location).min(1).max(100),
              })
              .strict(),
          )
          .max(20000),
        relations: z
          .array(
            z
              .object({
                id: uuid,
                type: z.enum([
                  "IMPORT",
                  "API_CALL",
                  "ROUTE_HANDLER",
                  "DATABASE",
                  "ENV",
                  "DEPENDENCY",
                  "SCHEMA_DEFINITION",
                ]),
                sourceKind: z.string().max(50),
                sourceValue: z.string().max(512),
                targetKind: z.string().max(50),
                targetValue: z.string().max(512),
                resolutionStatus: z.enum(["RESOLVED", "PARTIAL", "UNRESOLVED"]),
                confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
                metadata: z
                  .object({
                    evidence: z.string().max(1024),
                    locations: z.array(location).max(100),
                  })
                  .strict(),
              })
              .strict(),
          )
          .max(20000),
        aiInsights: z
          .array(
            z
              .object({
                id: uuid,
                type: z.enum([
                  "ISSUE_EXPLANATION",
                  "IMPROVEMENT",
                  "POTENTIAL_ISSUE",
                ]),
                confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
                title: z.string().min(1).max(256),
                explanation: z.string().min(1).max(2048),
                impact: z.string().max(1024).nullable(),
                suggestion: z.string().min(1).max(1024),
                evidenceStatus: z.enum(["SUPPORTED", "PARTIAL", "UNVERIFIED"]),
                relatedFingerprints: z.array(z.string().max(512)).max(100),
                locations: z.array(location).max(100),
              })
              .strict(),
          )
          .max(500),
      })
      .strict()
      .superRefine((audit, context) => {
        if (audit.analyzedFileCount > audit.fileCount)
          context.addIssue({
            code: "custom",
            path: ["analyzedFileCount"],
            message: "Analyzed files exceed total files",
          });
      }),
  })
  .strict();

export type PersistedAuditRequest = z.infer<typeof persistedAuditSchema>;
