import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type AuthContext =
  | { ok: true; client: SupabaseClient<Database>; user: User }
  | { ok: false; status: 401 | 503; message: string };

export async function requireUser(): Promise<AuthContext> {
  const client = await createClient();
  if (!client)
    return {
      ok: false,
      status: 503,
      message: "History storage is not configured.",
    };
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    return {
      ok: false,
      status: 401,
      message: "An active session is required.",
    };
  return { ok: true, client, user: data.user };
}
