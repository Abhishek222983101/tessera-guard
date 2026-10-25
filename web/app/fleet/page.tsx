"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import NumberFlow from "@number-flow/react";
import { Play } from "lucide-react";
import { post } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useApi, ErrorNote } from "@/lib/useApi";
import type { Agent, OrbitNode } from "@/lib/types";
import TwoLaneFeed from "@/components/feed/TwoLaneFeed";
import ApprovalCard from "@/components/feed/ApprovalCard";
import Empty from "@/components/feed/Empty";
import Skeleton from "@/components/feed/Skeleton";
import { bandColor } from "@/components/feed/VerdictChip";
import { bandOf } from "@/components/feed/RiskGauge";
import { LEVELS } from "@/components/feed/LadderStepper";
import { PageHeader, TestGuide, Hint, Callout } from "@/components/ui/kit";

interface Fleet { kpis: { agents: number; open_cases: number; contained: number; pending_approvals: number; utility_retention: number | null }; orbit: OrbitNode[] }

const Orbit = dynamic(() => import("@/components/orbit/OrbitScene").catch(() => ({ default: () => <Empty title="3D view unavailable" /> })) as never, { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }) as React.ComponentType<{ orbit: OrbitNode[]; onSelect: (id: string) => void; mode?: "3d" | "2d" }>;

export default function FleetPage() {
  const router = useRouter();
  const fleet = useApi<Fleet>("/fleet", { poll: 4000 });
  const agents = useApi<Agent[]>("/agents", { poll: 4000 });
  const verdicts = useStore((s) => s.verdicts); const approvals = useStore((s) => s.approvals); const conn = useStore((s) => s.conn); const runs = useStore((s) => s.runs);
  const [mode, setMode] = useState<"3d" | "2d">("2d"); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const pending = useMemo(() => Object.values(approvals).filter((a) => a.status === "pending"), [approvals]);
  const hist = useMemo(() => { const m: Record<string, number[]> = {}; for (const v of verdicts.slice(-300)) (m[v.agent_id] ??= []).push(v.risk); return m; }, [verdicts]);
  const lastRun = useMemo(() => Object.values(runs).filter((r) => r.state === "finished" && r.utility).slice(-1)[0] as undefined | { scenario?: string; utility?: { legit_total: number; legit_done: number; legit_pending_approval: number }; outcome?: { attack_blocked: number; attack_steps: number; exfil_succeeded: boolean } }, [runs]);
  const k = fleet.data?.kpis;
  async function run() { setBusy(true); setErr(null); try { await post("/scenarios/S1/run"); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }
  const decide = (id: string, what: "approve" | "reject") => post(`/approvals/${id}/${what}`);
  const stats: { label: string; value: number | null; unit?: string; tone?: string; hint: string }[] = [
    { label: "Agents", value: k?.agents ?? null, hint: "Each one has a written job description." },
    { label: "Open cases", value: k?.open_cases ?? null, tone: k?.open_cases ? "var(--blood)" : undefined, hint: "Agents that stepped outside their job." },
    { label: "Waiting for you", value: pending.length || (k?.pending_approvals ?? 0), tone: pending.length ? "var(--amber)" : undefined, hint: "Held actions that need a human OK." },
    { label: "Real work kept", value: k?.utility_retention == null ? null : Math.round(k.utility_retention * 100), unit: "%", tone: "var(--moss)", hint: "Share of task steps still finished during attacks." },
  ];
  return (
    <div>
      <PageHeader title="Fleet" what="Every agent action, checked against its job description.">
        <button onClick={run} disabled={busy} className="btn btn-primary"><Play size={15} fill="currentColor" />{busy ? "Starting…" : "Run the attack"}</button>
      </PageHeader>
      <TestGuide id="fleet" steps={["Press Run the attack (top right).", "Watch Live actions: the middle column is today's access check.", "When 'Needs OK' appears, press Approve on the right.", "Click a red Blocked row to open its case."]}
        expect="The access check says Allowed on every row while TESSERA blocks the HR read and the upload. Most of the real work still finishes." />
      {err && <div role="alert" className="mb-4"><Callout tone="danger">{err}</Callout></div>}
      <ErrorNote error={fleet.error && conn !== "replay" ? fleet.error : null} onRetry={fleet.reload} />

      {lastRun?.outcome && (
        <div className="float-in mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-[15px]">
          <i aria-hidden className="h-2 w-2 rounded-full" style={{ background: lastRun.outcome.exfil_succeeded ? "var(--blood)" : "var(--moss)" }} />
          <b className="font-medium text-bone">{lastRun.outcome.exfil_succeeded ? "Data left the building" : "Attack stopped"}</b>
          <span className="text-muted">{lastRun.outcome.attack_blocked} of {lastRun.outcome.attack_steps} hostile steps blocked · {lastRun.utility?.legit_done} of {lastRun.utility?.legit_total} task steps done{lastRun.utility?.legit_pending_approval ? ` · ${lastRun.utility.legit_pending_approval} waiting` : ""}</span>
          <Link href="/cases" className="ml-auto text-muted underline-offset-4 hover:text-bone hover:underline">Open the case</Link>
        </div>)}

      <section aria-label="Key numbers" className="card mb-6 grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
        {stats.map((s) => (
          <div key={s.label} className="p-5 max-md:border-b max-md:border-line">
            <div className="flex items-center gap-1.5 text-[13px] text-muted">{s.label}<Hint>{s.hint}</Hint></div>
            <div className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight tnum" style={{ color: s.tone ?? "var(--bone)" }}>
              {s.value == null ? "–" : <NumberFlow value={s.value} />}{s.unit && s.value != null && <span className="ml-0.5 text-[16px] font-normal text-muted">{s.unit}</span>}</div>
          </div>))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-label="Live actions" className="flex min-w-0 flex-col">
          <h2 className="mb-3 flex items-center gap-2 text-[16px] font-semibold">Live actions<Hint>Each action is judged twice: once by today&apos;s access check, once by TESSERA. Click a blocked row to open its case.</Hint></h2>
          <div className="flex h-[560px] flex-col"><TwoLaneFeed verdicts={verdicts} onSelect={(v) => v.case_id && router.push(`/cases/${v.case_id}`)} emptyHint="Press Run the attack to see it." /></div>
        </section>

        <aside className="min-w-0 space-y-6">
          {pending.length > 0 && (
            <section aria-label="Waiting for you"><h2 className="mb-3 text-[16px] font-semibold">Waiting for you</h2>
              <div className="space-y-3">{pending.map((a) => <ApprovalCard key={a.id} approval={a} onApprove={() => decide(a.id, "approve")} onReject={() => decide(a.id, "reject")} />)}</div></section>)}

          <section aria-label="Agents"><h2 className="mb-3 flex items-center gap-2 text-[16px] font-semibold">Agents<Hint>Click an agent to see what it normally does.</Hint></h2>
            {agents.loading && !agents.data ? <Skeleton className="h-56" /> : !agents.data?.length ? <div className="card"><Empty title="No agents yet">Press Reset lab in the sidebar.</Empty></div> :
              <ul className="card divide-y divide-line overflow-hidden">{agents.data.map((a) => { const h = hist[a.id] ?? []; const col = bandColor(bandOf(a.risk_now)); const calm = a.status === "active" && a.risk_now < 30;
                const state = a.status === "killed" ? "Switched off" : a.status === "contained" ? `Contained · ${LEVELS[a.level]}` : a.maturity < 0.5 ? `Learning ${Math.round(a.maturity * 20)}/20` : calm ? "Normal" : "Elevated";
                return (
                  <li key={a.id}><Link href={`/agents/${a.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel2">
                    <i aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.status === "killed" ? "var(--blood)" : calm ? "var(--moss)" : "var(--amber)" }} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] text-bone">{a.name}</span><span className="block text-[13px] text-muted">{state}{a.open_cases > 0 ? ` · ${a.open_cases} case${a.open_cases > 1 ? "s" : ""}` : ""}</span></span>
                    <span className="flex h-6 items-end gap-[2px]" aria-hidden>{Array.from({ length: 14 }).map((_, i) => { const r = h[h.length - 14 + i]; return <i key={i} className="block w-[3px] rounded-[1px]" style={{ height: r == null ? 2 : Math.max(3, r * 0.24), background: r == null ? "var(--panel-3)" : bandColor(bandOf(r)) }} />; })}</span>
                    <span className="w-8 text-right text-[16px] font-semibold tnum" style={{ color: col }} aria-label={`risk ${Math.round(a.risk_now)}`}>{Math.round(a.risk_now)}</span>
                  </Link></li>); })}</ul>}
          </section>

          <section aria-label="Orbit">
            <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-[16px] font-semibold">Roles<Hint>Each ball is an agent and its shell is what its job allows. Risky behaviour pulls it outwards.</Hint></h2>
              <div role="group" aria-label="View" className="flex rounded-md border border-line p-0.5 text-[13px]">
                {(["3d", "2d"] as const).map((m) => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className={`rounded px-2.5 py-1 font-medium uppercase ${mode === m ? "bg-panel3 text-bone" : "text-muted"}`}>{m}</button>)}</div></div>
            <div className="card h-[300px] overflow-hidden bg-ink"><Suspense fallback={<Skeleton className="h-full w-full" />}>
              {fleet.data?.orbit ? <Orbit orbit={fleet.data.orbit} mode={mode} onSelect={(id) => router.push(`/agents/${id}`)} /> : <Skeleton className="h-full w-full" />}</Suspense></div>
          </section>
        </aside>
      </div>
    </div>);
}
