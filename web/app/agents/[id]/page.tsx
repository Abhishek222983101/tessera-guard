"use client";
import Link from "next/link";
import CirculariumRing from "@/components/ui/circularium-ring";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/useApiB";
import { post, ApiError } from "@/lib/api";
import { mockAgent } from "@/lib/mockB";
import { useStore } from "@/lib/store";
import { markDone } from "@/lib/guide";
import { PageHead, Section, Btn, SampleBadge, ErrorBox, Skeleton, Empty, levelName, bandColor } from "@/components/ui/bits";
import { TestGuide, BigStat, Pill } from "@/components/ui/kit";
import { LineChart, HBar } from "@/components/ui/charts";
import { Plus } from "lucide-react";
import type { ChangeEvent } from "@/lib/types";
const TransitionGraph = dynamic(() => import("@/components/twin/TransitionGraph"), { ssr: false, loading: () => <Skeleton h={420} /> });

interface Twin {
  hour_grid?: number[][];
  role_contract_summary: { name: string; version: number; purpose: string; tools: string[]; never_read: string[] };
  tool_usage: { tool: string; count: number; share: number }[]; transitions: { from: string; to: string; p: number; count: number }[];
  envelopes: { tool: string; param: string; median: number; mad: number; min: number; max: number }[];
  volume: { session: number; steps: number; bytes_out: number }[]; cusum: { session: number; value: number; alarm: number }[];
  thresholds: Record<string, number>; cohort: { peer_shift: number; fleet_shift: boolean };
  baseline: { state: "cold" | "warming" | "mature"; n_sessions: number }; decoys: { path: string; touched: boolean }[];
  change_windows: ChangeEvent[]; risk_history: { ts: number; risk: number }[];
}
interface AgentFull { id: string; name: string; role: string; status: string; level: number; maturity: number; sessions_seen: number; risk_now: number; open_cases: number; scopes: string[]; hosts: string[]; utility_retention: number | null; twin: Twin }

export default function AgentPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter();
  const { data: a, loading, error, sample, reload } = useApi<AgentFull>(`/agents/${id}`, mockAgent(id) as unknown as AgentFull, [id]);
  const allCases = useStore((s) => s.cases);
  const cases = useMemo(() => Object.values(allCases).filter((c) => c.agent_id === id).sort((x, y) => y.updated_ts - x.updated_ts).slice(0, 5), [allCases, id]);
  const [spawning, setSpawning] = useState(false); const [spawnErr, setSpawnErr] = useState<string | null>(null);
  async function spawn() {
    setSpawning(true); setSpawnErr(null);
    try { const r = await post<{ id: string }>("/agents", { template: a.role }); markDone("cold-start"); router.push(`/agents/${r.id}`); }
    catch (e) { setSpawnErr(e instanceof ApiError ? e.message : "Couldn't create the agent"); } finally { setSpawning(false); }
  }
  const t = a.twin;
  const maxUse = useMemo(() => Math.max(1, ...t.tool_usage.map((u) => u.count)), [t]);
  if (loading && !a) return <Skeleton h={400} />;
  const matN = Math.min(20, Math.round(a.maturity * 20)); const cold = t.baseline.state === "cold" || a.maturity < 0.5;
  const rc = t.role_contract_summary;
  return (
    <div>
      <PageHead title={a.name} sub={rc.purpose} right={<>{sample && <SampleBadge />}<span className="mono text-[13px] text-faint">{a.id}</span>
        <Btn kind="solid" onClick={spawn} disabled={spawning}><Plus size={16} />{spawning ? "Creating…" : "New agent, no history"}</Btn></>} />
      <TestGuide id="agent" steps={["Read Role, Behaviour and Drift top to bottom.", "Press “New agent, no history”.", "Check its maturity reads 0 of 20.", "Attack it from Attack Lab. It is still caught."]}
        expect="A new agent shows maturity 0/20 with learned checks in shadow, and the attack is still blocked by contract, provenance, decoy and content checks." />
      {error && <ErrorBox message={error} onRetry={reload} />}{spawnErr && <ErrorBox message={spawnErr} />}
      <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <BigStat label="Status" value={a.status === "active" ? "Working" : a.status === "killed" ? "Killed" : "Contained"} tone={a.status === "active" ? "moss" : "blood"} hint={`Containment L${a.level}: ${levelName(a.level)}`} />
        <BigStat label="Risk now" value={Math.round(a.risk_now)} tone={a.risk_now >= 60 ? "blood" : a.risk_now >= 30 ? "amber" : "moss"} hint="0 calm, 100 certain trouble" />
        <BigStat label="Sessions learned" value={a.sessions_seen} tone="violet" hint={cold ? "Still warming up" : "Fully learned"} />
        <BigStat label="Work kept" value={a.utility_retention == null ? "–" : Math.round(a.utility_retention * 100)} unit={a.utility_retention == null ? "" : "%"} hint="Share of legitimate steps that still finish during an attack" />
      </div>
      {t.hour_grid && <div className="mb-6"><CirculariumRing key={a.id} title="Working-hours clock" subtitle="When this agent normally works. A call at 03:00 would light up the night." hint="Rings = weekdays, Monday innermost. Sectors = hours, midnight at the top." data={t.hour_grid} palette={{ light: ["#bcd6ff", "#7fb0ff", "#3b82f6", "#1d4ed8"], dark: ["#16243d", "#1f4a8f", "#3b82f6", "#a9cdff"] }} unit="min active" legendLabels={["Quiet", "Busy"]} /></div>}
      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Role" hint={<>The declared job this agent is compared against. <Link href="/contracts" className="underline">Edit in Role contracts</Link>.</>}>
          <div className="mb-3 flex flex-wrap gap-1.5">{rc.tools.map((x) => <Pill key={x} tone="gray"><span className="mono">{x}</span></Pill>)}</div>
          <div className="mb-1.5 text-[13px] text-faint">Never reads</div><div className="flex flex-wrap gap-1.5">{rc.never_read.map((x) => <Pill key={x} tone="red"><span className="mono">{x}</span></Pill>)}</div>
        </Section>
        <Section title="Learning" hint="New agents start with no history. Contract, provenance, decoys and content protect them from step one; learned checks stay in shadow until half-learned.">
          <div className="flex items-baseline gap-2"><span className="mono tnum text-[28px] font-semibold text-violet">{matN}</span><span className="text-[15px] text-muted">of 20 sessions</span></div>
          <div className="mt-2 h-1.5 rounded-full bg-panel3" role="meter" aria-label="Baseline maturity" aria-valuenow={a.maturity * 100} aria-valuemin={0} aria-valuemax={100}><div className="h-1.5 rounded-full bg-violet transition-[width] duration-500" style={{ width: `${a.maturity * 100}%` }} /></div>
          <div className="mt-3 text-[15px] text-muted">{cold ? "Learned checks run in shadow." : "All checks enforcing."}</div>
          <div className="mt-4"><HBar label="shift vs peers" value={t.cohort.peer_shift} max={1} color={t.cohort.fleet_shift ? "var(--amber)" : "var(--moss)"} right={t.cohort.peer_shift.toFixed(2)} /></div>
        </Section>
        <Section title="Decoys" hint="Bait files no real job opens. Touching one is conclusive.">
          <ul className="space-y-2">{t.decoys.map((d) => (<li key={d.path} className="flex items-center justify-between gap-2"><span className="mono truncate text-[13px] text-muted" title={d.path}>{d.path}</span><Pill tone={d.touched ? "red" : "gray"}>{d.touched ? "touched" : "untouched"}</Pill></li>))}</ul>
          {!t.decoys.length && <p className="text-[15px] text-muted">None for this role.</p>}
          <div className="mt-4 text-[13px] text-faint">Declared changes</div>
          {t.change_windows.length ? t.change_windows.map((c) => <div key={c.id} className="text-[15px]">{c.description || c.kind}</div>) : <div className="text-[15px] text-muted">None. <Link className="underline" href="/changes">Declare one</Link></div>}
        </Section>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Section title="Tool order" hint="How likely one tool is to follow another. A step that never appears here, such as an HR read, stands out.">
          {t.transitions.length ? <TransitionGraph transitions={t.transitions} /> : <Empty title="Nothing learned yet" />}
        </Section>
        <Section title="Usage and ranges" hint="Bars: how often each tool is used. Bands: the usual range of an amount; the tick is typical.">
          {t.tool_usage.length ? t.tool_usage.map((u) => <HBar key={u.tool} label={u.tool} value={u.count} max={maxUse} color="var(--violet)" right={`${Math.round(u.share * 100)}%`} />) : <Empty title="No usage yet" />}
          <div className="mt-5 space-y-3">{t.envelopes.map((e) => { const span = Math.max(1, e.max * 1.15); return (
            <div key={e.tool + e.param} className="text-[15px]"><div className="flex justify-between"><span className="mono text-muted">{e.tool}.{e.param}</span><span className="mono tnum">{e.median.toLocaleString()}</span></div>
              <div className="relative mt-1.5 h-2 rounded-full bg-panel3"><div className="absolute h-2 rounded-full bg-violet/50" style={{ left: `${(Math.max(0, e.median - 3 * e.mad) / span) * 100}%`, width: `${Math.min(100, ((6 * e.mad) / span) * 100)}%` }} /><div className="absolute -top-0.5 h-3 w-0.5 rounded bg-bone" style={{ left: `${(e.median / span) * 100}%` }} /></div></div>); })}</div>
        </Section>
        <Section title="Data sent out" hint="Bytes sent per session. A line that keeps climbing means it sends a little more each time.">
          {t.volume.length ? <LineChart label="Bytes sent out per session" series={[{ name: "bytes out", color: "var(--ice)", area: true, points: t.volume.map((v) => ({ x: v.session, y: v.bytes_out })) }]} xLabel="session" h={180} yFmt={(v) => `${Math.round(v)}`} /> : <Empty title="No sessions yet" />}
        </Section>
        <Section title="Slow-drift alarm" hint="Adds up small steady changes. Crossing the red line holds the agent for review.">
          {t.cusum.length ? <LineChart label="Slow-drift statistic with alarm line" series={[{ name: "drift", color: "var(--ember)", points: t.cusum.map((v) => ({ x: v.session, y: v.value })) }]} threshold={t.cusum[0]?.alarm} thresholdLabel="alarm" xLabel="session" h={180} /> : <Empty title="Not enough sessions" />}
        </Section>
        <Section title="Risk history" hint="Peaks are single risky actions. The red line marks ‘high’.">
          {t.risk_history.length ? <LineChart label="Risk history" series={[{ name: "risk", color: "var(--violet)", area: true, points: t.risk_history.map((r, i) => ({ x: i, y: r.risk })) }]} yMax={100} threshold={60} thresholdLabel="high" h={180} /> : <Empty title="No history yet" />}
        </Section>
        <Section title="Cases">{cases.length ? <ul className="divide-y divide-line">{cases.map((c) => (<li key={c.id}><Link href={`/cases/${c.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-bone"><span className="text-[15px] text-muted">{c.title}</span><span className="mono tnum text-[16px] font-medium" style={{ color: bandColor(c.max_risk) }}>{Math.round(c.max_risk)}</span></Link></li>))}</ul>
          : <Empty title="No cases" hint="Healthy. Attack it from the lab to see one." action={<Link href="/lab" className="btn btn-primary">Open Attack Lab</Link>} />}</Section>
      </div>
    </div>
  );
}
