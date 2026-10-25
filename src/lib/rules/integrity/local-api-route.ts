import { makeDraft } from "../types";
import type { AuditRule } from "../types";

export const localApiRouteRule: AuditRule = {
  id: "integrity.local-api-route",
  category: "DATA_INTEGRITY",
  run(context) {
    return context.analysis.apiCalls
      .filter(
        (call) =>
          !call.dynamic &&
          Boolean(call.path?.startsWith("/api/")) &&
          !call.routeFile &&
          call.resolutionStatus === "UNRESOLVED",
      )
      .map((call) =>
        makeDraft(
          "integrity.local-api-route",
          "DATA_INTEGRITY",
          "HEURISTIC",
          "MEDIUM",
          `Local API route was not found: ${call.path}`,
          "A static local /api request did not match any extracted Next.js App Router endpoint. The endpoint may be generated or outside the selected folder.",
          [call.location],
          `Unresolved local request: ${call.method} ${call.path}.`,
          "Confirm the route path and include the corresponding App Router route file in the selected project.",
          `${call.sourceFile.toLowerCase()}:${call.location.line}:${call.path?.toLowerCase()}`,
        ),
      );
  },
};
