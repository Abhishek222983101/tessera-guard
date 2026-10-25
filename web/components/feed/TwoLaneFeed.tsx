"use client";
import { useMemo, useRef } from "react";
import NumberFlow from "@number-flow/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Verdict } from "@/lib/types";
import VerdictChip, { bandColor } from "./VerdictChip";
import Empty from "./Empty";

const ROW = 52;
const fmtArgs = (a: Record<string, unknown>) => Object.entries(a).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join("  ");
const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour12: false });

/** The signature view. Column 2 = what today's access check says (always fine). Column 3 = what TESSERA says. */
export default function TwoLaneFeed({ verdicts, onSelect, selectedId, compact, maxRows = 400, emptyHint }: {
  verdicts: Verdict[]; onSelect?: (v: Verdict) => void; selectedId?: string; compact?: boolean; maxRows?: number; emptyHint?: string;
}) {
  const rows = useMemo(() => verdicts.slice(-maxRows).reverse(), [verdicts, maxRows]);
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer is used only inside this component
  const vir = useVirtualizer({ count: rows.length, getScrollElement: () => ref.current, estimateSize: () => ROW, overscan: 8 });
  const grid = "grid-cols-[minmax(0,1.5fr)_120px_minmax(150px,1fr)] max-md:grid-cols-[minmax(0,1fr)_auto]";
  return (
    <div className="card flex min-h-0 flex-1 flex-col overflow-hidden" role="table" aria-label="Live actions: today's access check versus TESSERA">
      <div role="row" className={`grid ${grid} items-center border-b border-line px-4 py-2.5 text-[13px] font-medium text-muted`}>
        <span role="columnheader">Action</span><span role="columnheader" className="max-md:hidden">Access check</span><span role="columnheader" className="text-bone">TESSERA</span>
      </div>
      <div ref={ref} className="min-h-[200px] flex-1 overflow-y-auto" style={{ contain: "strict" }}>
        {rows.length === 0 ? <Empty title="No actions yet">{emptyHint ?? "Run a scenario and every tool call appears here, judged twice."}</Empty> : (
          <div style={{ height: vir.getTotalSize(), position: "relative" }}>
            {vir.getVirtualItems().map((it) => {
              const v = rows[it.index]; const col = bandColor(v.band); const sel = v.id === selectedId;
              const rail = v.decision === "DENY" ? "var(--blood)" : v.decision === "STEP_UP" ? "var(--amber)" : sel ? "var(--bone)" : "transparent";
              return (
                <div key={v.id} role="row" data-index={it.index} style={{ position: "absolute", top: 0, left: 0, right: 0, height: ROW, transform: `translateY(${it.start}px)` }}>
                  <button type="button" onClick={() => onSelect?.(v)} aria-pressed={sel}
                    className={`row-in grid h-full w-full ${grid} items-center border-b border-line px-4 text-left transition-colors hover:bg-panel2 ${sel ? "bg-panel2" : ""}`} style={{ boxShadow: `inset 2px 0 0 ${rail}` }}>
                    <span className="min-w-0 pr-3"><span className="mono block truncate text-[15px] font-medium text-bone">{v.tool}</span>
                      <span className="block truncate text-[13px] text-muted" title={fmtArgs(v.args)}>{clock(v.ts)}  {compact ? v.agent_id : (fmtArgs(v.args) || "no details")}</span></span>
                    <span className="text-[13px] text-muted max-md:hidden" title={v.iam?.label}><span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-1.5 w-1.5 rounded-full bg-moss" />Allowed</span></span>
                    <span className="flex items-center gap-2.5"><VerdictChip decision={v.decision} compact />
                      <NumberFlow value={Math.round(v.risk)} className="tnum text-[15px] font-semibold" style={{ color: col }} aria-label={`risk ${Math.round(v.risk)}`} /></span>
                  </button>
                </div>);
            })}
          </div>)}
      </div>
    </div>
  );
}
