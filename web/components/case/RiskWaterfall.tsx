"use client";
import type { Verdict } from "@/lib/types";
import { bandColor } from "@/components/feed/VerdictChip";
import { bandOf } from "@/components/feed/RiskGauge";

const NAME: Record<string, string> = { contract: "Outside the job description", provenance: "Untrusted text steered it", decoy: "Touched bait files", content: "Document hid instructions", chain: "Handed over by a tainted agent", context: "Odd place or time", sequence: "Unusual order of steps", params: "Unusual values", intent: "Looks like a different job", drift: "Slowly changing behaviour" };
const FLOOR: Record<string, string> = { decoy_touch: "Touched a decoy", tool_drift: "Tool changed after approval", untrusted_control_mutating: "Untrusted text chose the destination", sensitive_egress: "Sensitive data leaving", contract_violation: "Breaks the role contract", tainted_mutation: "Hijacked session wants to change something", untrusted_control_read: "A document chose what to read", stolen_context: "Valid token, unfamiliar host", drift_alarm: "Sustained drift" };
export const layerName = (l: string) => NAME[l] ?? l;

/** Risk built up one check at a time. Bars sum to the pre-floor score; a rule can lift it when the evidence is conclusive. */
export default function RiskWaterfall({ v }: { v: Verdict }) {
  const steps = v.waterfall;
  const pre = steps.length ? steps[steps.length - 1].cumulative : 0;
  const rows = [...steps.map((s) => ({ ...s, kind: "layer" as const })), ...(v.floor && v.floor.value > pre ? [{ layer: "floor", delta: v.floor.value - pre, cumulative: v.floor.value, kind: "floor" as const }] : [])];
  const col = bandColor(bandOf(v.risk));
  if (!rows.length) return <p className="text-[15px] text-muted">Nothing unusual added to this score.</p>;
  return (
    <div role="img" aria-label={`Risk ${Math.round(v.risk)} built from ${rows.map((r) => `${layerName(r.layer)} ${r.delta >= 0 ? "+" : ""}${r.delta}`).join(", ")}`}>
      <ul className="space-y-2.5">
        {rows.map((r) => { const start = r.cumulative - r.delta; const c = r.kind === "floor" ? "var(--blood)" : `var(--l-${r.layer})`;
          return (
            <li key={r.layer} className="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-[15px]">
              <span className="truncate text-bone" title={r.kind === "floor" ? FLOOR[v.floor?.name ?? ""] : layerName(r.layer)}>{r.kind === "floor" ? (FLOOR[v.floor?.name ?? ""] ?? "Hard rule") : layerName(r.layer)}</span>
              <span className="relative h-2 rounded-full bg-panel3"><i className="absolute top-0 h-full rounded-full" style={{ left: `${Math.max(start, 0)}%`, width: `${Math.max(Math.abs(r.delta), 1.2)}%`, background: c, opacity: r.kind === "floor" ? 0.75 : 1, transition: "width 400ms ease-out" }} /></span>
              <span className="text-right font-medium tnum" style={{ color: c }}>+{Math.round(r.delta)}</span>
            </li>); })}
      </ul>
      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3"><span className="text-[15px] text-muted">Total</span><span className="text-[24px] font-semibold tnum" style={{ color: col }}>{Math.round(v.risk)}<span className="text-[15px] font-normal text-muted"> / 100</span></span></div>
    </div>);
}
