import type { Utility } from "@/lib/types";

/** How much of the legitimate task still got done while the agent was contained. */
export default function UtilityMeter({ utility, className = "" }: { utility?: Partial<Utility> | null; className?: string }) {
  if (!utility || !utility.legit_total) return <div className={`text-[15px] text-muted ${className}`}>Appears once the agent has run.</div>;
  const t = utility.legit_total, d = utility.legit_done ?? 0, p = utility.legit_pending_approval ?? 0, b = utility.legit_blocked ?? 0;
  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[15px] text-muted">
        <span className="text-[20px] font-semibold tnum text-bone">{d} of {t}</span> steps finished
        {p > 0 && <span className="text-amber">· {p} waiting for you</span>}{b > 0 && <span>· {b} blocked</span>}
      </div>
      <div className="flex h-1.5 gap-1" role="img" aria-label={`${d} done, ${p} awaiting approval, ${b} blocked, out of ${t}`}>
        {Array.from({ length: t }).map((_, i) => (<span key={i} className="flex-1 rounded-full" style={{ background: i < d ? "var(--moss)" : i < d + p ? "var(--amber)" : i < d + p + b ? "var(--blood)" : "var(--panel-3)", transition: "background 300ms" }} />))}
      </div>
    </div>
  );
}
