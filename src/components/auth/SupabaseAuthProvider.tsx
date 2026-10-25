"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import {
  ensureAnonymousSession,
  type AnonymousAuthResult,
} from "@/lib/supabase/auth-client";

type AuthState = {
  status: "loading" | "ready" | "unavailable";
  user: User | null;
  message: string | null;
  retry: () => Promise<AnonymousAuthResult>;
};
const AuthContext = createContext<AuthState | null>(null);

export function SupabaseAuthProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const client = createClient();
    const subscription = client?.auth.onAuthStateChange((_event, session) => {
      if (active && session?.user) {
        setUser(session.user);
        setStatus("ready");
        setMessage(null);
      }
    }).data.subscription;
    void ensureAnonymousSession().then((result) => {
      if (!active) return;
      setUser(result.user);
      setStatus(result.available ? "ready" : "unavailable");
      setMessage(result.available ? null : result.message);
    });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      message,
      retry: async () => {
        setStatus("loading");
        const result = await ensureAnonymousSession();
        setUser(result.user);
        setStatus(result.available ? "ready" : "unavailable");
        setMessage(result.available ? null : result.message);
        return result;
      },
    }),
    [message, status, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth() {
  const value = useContext(AuthContext);
  if (!value)
    throw new Error("useSupabaseAuth must be used within SupabaseAuthProvider");
  return value;
}
