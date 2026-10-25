"use client";

export type Protection = "tessera" | "iam_only";
/** Switch protection off to show what classic IAM alone lets through. */
export default function ProtectionToggle({ value, onChange }: { value: Protection; onChange: (v: Protection) => void }) {
  const off = value === "iam_only";
  return (
    <button type="button" role="switch" aria-checked={!off} onClick={() => onChange(off ? "tessera" : "iam_only")}
      className="flex w-full items-center gap-3 rounded-lg border border-line px-4 py-3 text-left transition-colors hover:bg-panel2" style={{ borderColor: off ? "var(--blood)" : undefined }}>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium text-bone">{off ? "Protection off" : "Protection on"}</span>
        <span className="block text-[15px] text-muted">{off ? "Only today's access checks. The attack goes through." : "TESSERA is watching every action."}</span></span>
      <span aria-hidden className="relative h-5 w-9 shrink-0 rounded-full transition-colors" style={{ background: off ? "var(--blood)" : "var(--moss)" }}><i className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: off ? 2 : 18 }} /></span>
    </button>);
}
