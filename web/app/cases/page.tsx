"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Play } from "lucide-react";
import { useStore } from "@/lib/store";
import { useApi, ErrorNote } from "@/lib/useApi";
import type { Case } from "@/lib/types";
import { bandColor } from "@/components/feed/VerdictChip";
import { bandLabel } from "@/components/feed/RiskGauge";
import Empty from "@/components/feed/Empty";
import Skeleton from "@/components/feed/Skeleton";
import { PageHeader, TestGuide, Pill } from "@/components/ui/kit";

export default function CasesPage() {
  const api = useApi<Case[]>("/cases?limit=100", { poll: 4000 });
  const live = useStore((s) => s.cases);
  const cases = useMemo(() => { const m = new Map<string, Case>(); for (const c of api.data ?? []) m.set(c.id, c); for (const c of Object.values(live)) m.set(c.id, c); return [...m.values()].sort((a, b) => b.updated_ts - a.updated_ts); }, [api.data, live]);
  return (
    <div>
      <PageHeader title="Cases" what="One case per agent that stepped outside its job." />
      <TestGuide id="cases" steps={["If empty, run the attack from Fleet or Live demo.", "Open the newest case.", "Find the red-boxed sentence on the PDF: that is where it started."]} expect="One case per attack, with severity, a summary, and how much real work still got done." />
      <ErrorNote error={api.error} onRetry={api.reload} />
      {api.loading && !cases.length ? <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : cases.length === 0 ? (
        <div className="card"><Empty title="No cases yet" action={<Link href="/demo" className="btn btn-primary"><Play size={15} fill="currentColor" />Run an attack</Link>}>A case appears when an agent drifts from its role.</Empty></div>) : (
        <ul className="card divide-y divide-line overflow-hidden">{cases.map((c) => { const col = bandColor(c.severity); const shift = c.kind === "shift" || c.kind === "unexplained_shift"; return (
          <li key={c.id}><Link href={`/cases/${c.id}`} className="flex items-center gap-5 px-5 py-4 transition-colors hover:bg-panel2">
            <span className="w-12 text-[28px] font-semibold tracking-tight tnum" style={{ color: col }}>{Math.round(c.max_risk)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium text-bone">{c.title}</span>
              <span className="block truncate text-[15px] text-muted">{c.summary}</span></span>
            <span className="hidden items-center gap-2 sm:flex">{shift && <Pill tone="violet">Not an attack</Pill>}<Pill tone={c.severity === "critical" ? "red" : c.severity === "high" ? "orange" : c.severity === "elevated" ? "amber" : "green"}>{bandLabel(c.severity)}</Pill>
              <Pill tone={c.status === "contained" ? "amber" : c.status === "resolved" ? "green" : "red"}>{c.status === "contained" ? `Level ${c.containment_level}` : c.status === "resolved" ? "Resolved" : "Open"}</Pill></span>
          </Link></li>); })}</ul>)}
    </div>);
}
