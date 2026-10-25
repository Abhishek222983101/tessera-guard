"use client";
import { Hint } from "@/components/ui/kit";
export const LEVELS = ["Observe", "Step-up", "Narrow", "Quarantine", "Decoy sandbox", "Killed"];
const DESC = ["Watching. Nothing is restricted.", "Risky actions need a human OK.", "Writes and sending are removed for this session.", "Read-only. Content is cleaned before the agent sees it.", "Calls go to a fake world so we can watch.", "Token revoked. The agent is switched off."];
const col = (i: number) => (i >= 4 ? "var(--blood)" : i >= 2 ? "var(--ember)" : i === 1 ? "var(--amber)" : "var(--moss)");

/** Six-step containment ladder as a segmented control. Click a step to apply it by hand. */
export default function LadderStepper({ level, onChange, disabled, compact }: { level: number; onChange?: (l: number) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <div>
      <ol className="flex overflow-x-auto rounded-lg border border-line" aria-label="Containment ladder">
        {LEVELS.map((n, i) => {
          const cur = i === level; const c = col(i);
          const body = (<span className="flex flex-col items-start gap-0.5 text-left"><span className="text-[12.5px] text-faint tnum">L{i}</span><span className="text-[15px] font-medium" style={{ color: cur ? c : "var(--muted)" }}>{compact ? "" : n}</span></span>);
          const cls = `min-w-0 flex-1 px-3 py-2 ${i > 0 ? "border-l border-line" : ""} ${cur ? "bg-panel2" : ""}`;
          const st = cur ? { boxShadow: `inset 0 -2px 0 ${c}` } : undefined;
          return (<li key={n} className="flex min-w-[92px] flex-1">
            {onChange ? <button type="button" disabled={disabled} onClick={() => onChange(i)} title={`${n}: ${DESC[i]}`} aria-pressed={cur} className={`${cls} w-full transition-colors enabled:hover:bg-panel2 disabled:opacity-60`} style={st}>{body}</button>
              : <div title={`${n}: ${DESC[i]}`} aria-current={cur ? "step" : undefined} className={`${cls} w-full`} style={st}>{body}</div>}
          </li>);
        })}
      </ol>
      {!compact && <p className="mt-2 flex items-center gap-1.5 text-[15px] text-muted"><b className="font-medium text-bone">{LEVELS[Math.min(level, 5)]}</b><Hint>{DESC[Math.min(level, 5)]}</Hint></p>}
    </div>
  );
}
