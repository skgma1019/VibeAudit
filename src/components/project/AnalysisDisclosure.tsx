"use client";

export function AnalysisDisclosure({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-border bg-background p-4 text-sm leading-6">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
        className="mt-1 size-4 accent-violet-500"
      />
      <span>
        I understand that VibeAudit will send a minimized summary of my Rule
        findings, relevant relationships, schema names, and up to five short,
        secret-masked code excerpts to Google Gemini for AI analysis. The AI
        provider processes this data; full project files are not sent or stored
        by VibeAudit.
      </span>
    </label>
  );
}
