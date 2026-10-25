"use client";
import { Switch } from "@/components/ui/switch";
import { Hint } from "@/components/ui/kit";

export type Protection = "tessera" | "iam_only";
/** Compact on/off row: protection on (TESSERA) or off (classic access checks only). */
export default function ProtectionSwitch({ value, onChange }: { value: Protection; onChange: (v: Protection) => void }) {
  const on = value === "tessera";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
      <label htmlFor="prot" className="flex min-w-0 items-center gap-2 text-[15px]">
        <span className={`h-2 w-2 shrink-0 rounded-full ${on ? "bg-moss" : "bg-blood"}`} />
        <span className="whitespace-nowrap font-medium">{on ? "Protection on" : "Protection off"}</span>
        <Hint>Off shows today&apos;s reality: only the access check runs, so the attack goes through.</Hint>
      </label>
      <Switch id="prot" checked={on} onCheckedChange={(c) => onChange(c ? "tessera" : "iam_only")} aria-label="Protection" />
    </div>);
}
