export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TimestampColumns = { created_at: string };
type Owned = { owner_id: string };
type Relation<T> = T & { id: string };

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: Relation<
          Owned &
            TimestampColumns & {
              name: string;
              framework: string | null;
              stack: Json;
              updated_at: string;
            }
        >;
        Insert: Owned & {
          name: string;
          framework?: string | null;
          stack?: Json;
        } & Partial<TimestampColumns>;
        Update: Partial<{
          name: string;
          framework: string | null;
          stack: Json;
          updated_at: string;
        }>;
        Relationships: [];
      };
      audits: {
        Row: Relation<
          Owned &
            TimestampColumns & {
              project_id: string;
              request_id: string;
              overall_score: number;
              grade: "A" | "B" | "C" | "D" | "F";
              integrity_score: number;
              consistency_score: number;
              security_score: number;
              structure_score: number;
              dependency_score: number;
              coverage: Json;
              file_count: number;
              analyzed_file_count: number;
              issue_count: number;
              summary: Json | null;
              rule_version: string;
              score_version: string;
              ai_model: string | null;
              ai_status: string;
            }
        >;
        Insert: Owned & {
          project_id: string;
          request_id: string;
          overall_score: number;
          grade: "A" | "B" | "C" | "D" | "F";
          integrity_score: number;
          consistency_score: number;
          security_score: number;
          structure_score: number;
          dependency_score: number;
          coverage: Json;
          file_count: number;
          analyzed_file_count: number;
          issue_count: number;
          summary?: Json | null;
          rule_version: string;
          score_version: string;
          ai_model?: string | null;
          ai_status: string;
        } & Partial<TimestampColumns>;
        Update: never;
        Relationships: [];
      };
      audit_issues: {
        Row: Relation<
          Owned &
            TimestampColumns & {
              audit_id: string;
              fingerprint: string;
              rule_id: string;
              origin: "RULE";
              detection_kind: "DETERMINISTIC" | "HEURISTIC";
              category: string;
              severity: string;
              title: string;
              description: string;
              evidence: string;
              suggestion: string;
              resolved: boolean;
              updated_at: string;
            }
        >;
        Insert: Owned & {
          audit_id: string;
          fingerprint: string;
          rule_id: string;
          origin: "RULE";
          detection_kind: "DETERMINISTIC" | "HEURISTIC";
          category: string;
          severity: string;
          title: string;
          description: string;
          evidence: string;
          suggestion: string;
        } & Partial<TimestampColumns>;
        Update: Partial<
          Pick<
            Database["public"]["Tables"]["audit_issues"]["Row"],
            "resolved" | "updated_at"
          >
        >;
        Relationships: [];
      };
      audit_issue_locations: {
        Row: Relation<
          Owned &
            TimestampColumns & {
              issue_id: string;
              file_path: string;
              line: number;
              column: number;
            }
        >;
        Insert: Owned & {
          issue_id: string;
          file_path: string;
          line: number;
          column: number;
        } & Partial<TimestampColumns>;
        Update: never;
        Relationships: [];
      };
      audit_relations: {
        Row: Relation<
          Owned &
            TimestampColumns & {
              audit_id: string;
              relation_type: string;
              source_kind: string;
              source_value: string;
              target_kind: string;
              target_value: string;
              resolution_status: string;
              confidence: string;
              metadata: Json;
            }
        >;
        Insert: Owned & {
          audit_id: string;
          relation_type: string;
          source_kind: string;
          source_value: string;
          target_kind: string;
          target_value: string;
          resolution_status: string;
          confidence: string;
          metadata?: Json;
        } & Partial<TimestampColumns>;
        Update: never;
        Relationships: [];
      };
      audit_ai_insights: {
        Row: Relation<
          Owned &
            TimestampColumns & {
              audit_id: string;
              type: string;
              confidence: string;
              title: string;
              explanation: string;
              impact: string | null;
              suggestion: string;
              evidence_status: string;
              related_issue_ids: string[];
              locations: Json;
            }
        >;
        Insert: Owned & {
          audit_id: string;
          type: string;
          confidence: string;
          title: string;
          explanation: string;
          impact?: string | null;
          suggestion: string;
          evidence_status: string;
          related_issue_ids?: string[];
          locations?: Json;
        } & Partial<TimestampColumns>;
        Update: never;
        Relationships: [];
      };
      ai_usage: {
        Row: Relation<
          Owned &
            TimestampColumns & {
              request_id: string;
              finished_at: string | null;
            }
        >;
        Insert: Owned & {
          request_id: string;
          finished_at?: string | null;
        } & Partial<TimestampColumns>;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_audit: {
        Args: {
          p_request_id: string;
          p_project_id: string | null;
          p_project_name: string | null;
          p_framework: string | null;
          p_stack: Json;
          p_audit: Json;
        };
        Returns: Array<{ audit_id: string; project_id: string }>;
      };
      reserve_ai_request: { Args: { p_request_id: string }; Returns: string };
      finish_ai_request: { Args: { p_request_id: string }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
