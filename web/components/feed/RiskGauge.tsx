"use client";
import NumberFlow from "@number-flow/react";
import { bandColor } from "./VerdictChip";

export const bandOf = (r: number) => (r >= 80 ? "critical" : r >= 60 ? "high" : r >= 30 ? "elevated" : "normal");
export const bandLabel = (b: string) => ({ normal: "Normal", elevated: "Elevated", high: "High", critical: "Critical" }[b] ?? b);
export const bandWords = (b: string) => ({ normal: "Looks like normal work", elevated: "Worth a look", high: "Likely a problem", critical: "Almost certainly an attack" }[b] ?? "");

/** Half-ring gauge. The number carries the value; the band word carries the meaning (never colour alone). */
export default function RiskGauge({ risk, size = 180, showBand = true }: { risk: number; size?: number; showBand?: boolean }) {
  const r = Math.max(0, Math.min(100, risk)); const band = bandOf(r); const col = bandColor(band);
  const R = 46, C = Math.PI * R; const off = C * (1 - r / 100);
  return (
    <div className="inline-flex flex-col items-center" style={{ width: size }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r)} aria-label={`Risk ${Math.round(r)} of 100, ${band}`}>
      <svg viewBox="0 0 120 70" width={size} height={size * 0.58} aria-hidden>
        <path d="M14 62 A46 46 0 0 1 106 62" fill="none" stroke="var(--panel-3)" strokeWidth="7" strokeLinecap="round" />
        <path d="M14 62 A46 46 0 0 1 106 62" fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 500ms ease-out, stroke 200ms" }} />
      </svg>
      <div className="-mt-[34%] flex flex-col items-center leading-none">
        <NumberFlow value={Math.round(r)} className="tnum font-semibold tracking-tight" style={{ fontSize: size * 0.3, color: col }} />
        {showBand && <span className="mt-1.5 text-[13px] font-medium" style={{ color: col }}>{bandLabel(band)}</span>}
      </div>
    </div>
  );
}
