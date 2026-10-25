"use client";

import type { User } from "@supabase/supabase-js";
import { createClient } from "./browser";

export type AnonymousAuthResult =
  | { user: User; available: true }
  | { user: null; available: false; message: string };

let pendingSession: Promise<AnonymousAuthResult> | null = null;

async function readOrCreateSession(): Promise<AnonymousAuthResult> {
  const client = createClient();
  if (!client)
    return {
      user: null,
      available: false,
      message: "Audit history is unavailable until Supabase is configured.",
    };
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (data.session?.user) return { user: data.session.user, available: true };
  const { data: signedIn, error: signInError } =
    await client.auth.signInAnonymously();
  if (signInError || !signedIn.user) throw signInError;
  return { user: signedIn.user, available: true };
}

export function ensureAnonymousSession(): Promise<AnonymousAuthResult> {
  if (!pendingSession) {
    const locked =
      typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks.request("vibeaudit-anonymous-session", () =>
            readOrCreateSession(),
          )
        : readOrCreateSession();
    pendingSession = locked
      .catch(() => ({
        user: null,
        available: false as const,
        message:
          "Anonymous session setup failed. Local audits still work; history saving can be retried.",
      }))
      .finally(() => {
        pendingSession = null;
      });
  }
  return pendingSession!;
}
