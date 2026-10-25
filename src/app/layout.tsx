import type { Metadata } from "next";
import "./globals.css";
import { SupabaseAuthProvider } from "@/components/auth/SupabaseAuthProvider";

export const metadata: Metadata = {
  title: "VibeAudit — Project quality workspace",
  description:
    "AI-powered project quality auditing for modern web applications.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
      </body>
    </html>
  );
}
