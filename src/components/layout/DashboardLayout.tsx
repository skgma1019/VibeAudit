import type { ReactNode } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only fixed top-3 left-3 z-[100] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only"
      >
        Skip to content
      </a>
      <Header />
      <div className="flex min-h-[calc(100dvh-4rem)]">
        <aside className="hidden w-56 shrink-0 border-r border-border p-5 lg:block">
          <Sidebar />
        </aside>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
