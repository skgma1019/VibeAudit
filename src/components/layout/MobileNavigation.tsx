"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "./Sidebar";

export function MobileNavigation() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetTitle className="text-lg font-semibold">VibeAudit</SheetTitle>
        <SheetDescription className="mt-1 mb-8 text-xs text-muted-foreground">
          Project quality workspace
        </SheetDescription>
        <div className="min-h-0 flex-1">
          <Sidebar />
        </div>
      </SheetContent>
    </Sheet>
  );
}
