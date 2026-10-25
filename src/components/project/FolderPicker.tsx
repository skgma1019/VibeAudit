"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
const getSupport = () => "webkitdirectory" in document.createElement("input");
const getServerSupport = () => null;

export function FolderPicker({
  onFiles,
  onChoosing,
  onCancel,
  busy,
}: {
  onFiles: (files: File[]) => void;
  onChoosing: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const supported = useSyncExternalStore(
    subscribe,
    getSupport,
    getServerSupport,
  );
  useEffect(() => {
    const input = inputRef.current;
    input?.addEventListener("cancel", onCancel);
    return () => input?.removeEventListener("cancel", onCancel);
  }, [onCancel]);
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        {...{ webkitdirectory: "" }}
        className="hidden"
        aria-label="Select a local project directory"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          onFiles(files);
        }}
      />
      <Button
        size="lg"
        disabled={supported !== true}
        aria-describedby="folder-note"
        className="w-full sm:w-auto"
        onClick={() => {
          onChoosing();
          inputRef.current?.click();
        }}
      >
        <FolderOpen aria-hidden="true" />
        {busy ? "Choose Another Folder" : "Select Project Folder"}
      </Button>
      <p
        id="folder-note"
        className="mt-3 text-xs leading-5 text-muted-foreground"
      >
        {supported === null
          ? "Checking directory selection support…"
          : supported
            ? "Processed in this browser only. Nothing is uploaded."
            : "Directory selection is unavailable in this browser. Please use desktop Chrome or Edge."}
      </p>
    </div>
  );
}
