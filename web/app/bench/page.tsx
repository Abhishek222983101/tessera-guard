"use client";
import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";
import { useApi } from "@/lib/useApiB";
import { post, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { markDone } from "@/lib/guide";
import { mockBench } from "@/lib/mockB";
import { PageHead, Section, Btn, SampleBadge, ErrorBox, Empty, Tag, LAYER_LABEL, Skeleton } from "@/components/ui/bits";
import { TestGuide, Hint } from "@/components/ui/kit";
import { LineChart, HBar } from "@/components/ui/charts";
import { RefreshCw, ShieldAlert } from "lucide-react";

interface Metric { id: string; name: string; value: number; unit: string; tag?: string; note?: string; n?: number }
interface Abl { layer_off: string; kind?: string; blocked_rate: number | null; utility: number | null; exfil_rate?: number }
interface Bench {
  commit: string; seed: number; generated_at: number; metrics: Metric[]; ablation: Abl[]; cold_start: { n_sessions: number; detect_rate: number }[];
  calibration: { bin: number | string; pred: number; obs: number; n: number }[]; calibration_note?: string; limits?: string[]; adaptive: { attacker: string; success_rate: number; n: number }[]; latency: { p50: number; p95: number; p99: number };
}
const fmtV = (m: Metric) => (m.unit === "ratio" ? { v: m.value * 100, suffix: "%", small: "", dec: 1 } : m.unit === "ms" ? { v: m.value, suffix: "", small: "ms", dec: 2 } : m.unit === "%" ? { v: m.value, suffix: "%", small: "", dec: 1 }
  : m.unit === "per 1k" ? { v: m.value, suffix: "", small: "per 1,000 steps", dec: 2 } : m.unit === "% of runs" ? { v: m.value, suffix: "%", small: "of runs", dec: 0 } : { v: m.value, suffix: "", small: m.unit, dec: m.unit === "of 30" ? 0 : 2 });
const HEAD: { id: string; label: string; hint: string }[] = [
  { id: "false_alerts_per_1000", label: "False alerts", hint: "Alarms on normal, healthy traffic per 1,000 steps. Lower is better." },
  { id: "attack_blocked_rate", label: "Attacks stopped", hint: "Share of attacker steps blocked, held, or scored high." },
  { id: "utility_retention", label: "Work kept", hint: "Share of legitimate steps that still finish while an attack is in progress." },
  { id: "gateway_p95_ms", label: "Decision time (p95)", hint: "How long TESSERA takes to judge one action. Python reference build." },
];
export default function Bench() {
  const { data: b, loading, error, sample, reload } = useApi<Bench>("/bench", mockBench as unknown as Bench);
  const [runId, setRunId] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const run = useStore((s) => (runId ? s.runs[runId] : undefined));
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (run?.state === "finished") { reload(); setRunId(null); } }, [run?.state, reload]);
  useEffect(() => { markDone("bench"); }, []);
  async function rerun() { setErr(null); try { const r = await post<{ run_id: string }>("/bench/run"); setRunId(r.run_id); setTimeout(() => { reload(); setRunId(null); }, 60000); } catch (e) { setErr(e instanceof ApiError ? e.message : "Couldn't start the re-run"); } }
  if (loading && !b.metrics.length) return <Skeleton h={400} />;
  const tagged = b.metrics.filter((m) => m.tag === "MEASURED" || m.tag === "TARGET" || m.tag === "EXT"); const hidden = b.metrics.length - tagged.length;
  const by = Object.fromEntries(tagged.map((m) => [m.id, m]));
  const when = b.generated_at ? new Date(b.generated_at * 1000).toLocaleString() : "";
  const abl = b.ablation ?? []; const one = abl.filter((a) => a.kind === "leave_one_out" || a.kind === "baseline" || !a.kind); const only = abl.filter((a) => a.kind === "only" || a.kind === "group_off");
  const stories = [
    { title: "Does it cry wolf?", ids: ["false_alerts_per_1000", "benign_elevated_rate", "policy_stepups"] },
    { title: "Does it stop attacks?", ids: ["attack_blocked_rate", "exfil_with_iam_only", "slow_ramp_caught_session", "slow_ramp_no_drift_layer"] },
    { title: "Does it slow work?", ids: ["utility_retention", "gateway_p50_ms", "gateway_p95_ms", "gateway_p99_ms"] },
  ];
  return (
    <div>
      <PageHead title="Results" sub="Measured on the simulator. Every number is tagged." right={<>
        {sample && <SampleBadge />}<Btn onClick={rerun} disabled={!!runId || sample}><RefreshCw size={15} className={runId ? "animate-spin" : ""} />{runId ? "Re-running…" : "Re-run"}</Btn></>} />
      <TestGuide id="bench" steps={["Read the four headline numbers.", "Scroll to Smart attackers: failures are shown on purpose.", "Press Re-run and wait about a minute."]}
        expect="Few false alerts, attacks stopped, most work kept, and a mimic that succeeds when only learned layers run." />
      {(error || err) && <div className="mb-4"><ErrorBox message={(error || err)!} onRetry={error ? reload : undefined} /></div>}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px] text-faint"><span>code <b className="mono font-normal text-muted">{b.commit}</b></span><span>seed <b className="mono font-normal text-muted">{b.seed}</b></span>{when && <span>{when}</span>}
        {hidden > 0 && <span className="flex items-center gap-1 text-amber"><ShieldAlert size={14} />{hidden} untagged hidden</span>}</div>
      <div className="mb-10 grid grid-cols-2 gap-3 xl:grid-cols-4">{HEAD.map((h) => { const m = by[h.id]; if (!m) return <div key={h.id} className="card p-4 text-[15px] text-faint">{h.label}: not measured</div>; const f = fmtV(m); return (
        <div key={h.id} className="card p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[13px] text-muted">{h.label}<Hint>{h.hint}</Hint></span><Tag kind={m.tag!} /></div>
          <div className="mono tnum mt-3 text-[30px] font-semibold leading-none"><NumberFlow value={f.v} format={{ maximumFractionDigits: f.dec, minimumFractionDigits: 0 }} suffix={f.suffix} />{f.small && <span className="ml-1.5 text-[13px] font-normal text-muted">{f.small}</span>}</div>
          <div className="mt-2 text-[12.5px] text-faint">{m.n ? `n = ${m.n.toLocaleString()}` : ""}</div></div>); })}</div>
      <details className="mb-10"><summary className="cursor-pointer text-[15px] text-muted hover:text-bone">All measurements</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-3">{stories.map((st) => (<div key={st.title} className="card p-4"><div className="mb-2 text-[15px] font-medium">{st.title}</div>
          <ul className="divide-y divide-line">{st.ids.map((i) => by[i]).filter(Boolean).map((m) => { const f = fmtV(m); return (<li key={m.id} className="flex items-baseline justify-between gap-3 py-2 text-[13.5px]"><span className="text-muted" title={m.note}>{m.name}</span><span className="mono tnum shrink-0">{f.v.toLocaleString(undefined, { maximumFractionDigits: f.dec })}{f.suffix}<span className="ml-1 text-faint">{f.small}</span></span></li>); })}</ul></div>))}</div></details>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Smart attackers" hint="Share of runs where the attacker got data out. The last row is the point: with only learned layers a mimic gets through; the rule layers stop it.">
          {b.adaptive.length ? <ul className="space-y-4">{b.adaptive.map((a) => (<li key={a.attacker}><div className="mb-1.5 flex justify-between gap-3 text-[15px]"><span className="text-muted">{a.attacker}</span><b className="mono tnum font-medium" style={{ color: a.success_rate > 0 ? "var(--blood)" : "var(--moss)" }}>{(a.success_rate * 100).toFixed(0)}%</b></div>
            <div className="h-1.5 rounded-full bg-panel3"><div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, a.success_rate * 100)}%`, background: a.success_rate > 0 ? "var(--blood)" : "var(--moss)" }} /></div></li>))}</ul> : <Empty title="No adaptive runs yet" />}</Section>
        <Section title="Cold start" hint="Detection by learned layers alone as an agent gains history. Rule layers cover day zero.">
          {b.cold_start.length ? <LineChart label="Detection rate versus number of sessions seen" series={[{ name: "detect rate", color: "var(--violet)", area: true, points: b.cold_start.map((c) => ({ x: c.n_sessions, y: c.detect_rate })) }]} yMax={1} yFmt={(v) => `${Math.round(v * 100)}%`} xLabel="sessions of history" h={200} /> : <Empty title="Not measured yet" />}</Section>
        <Section title="Switch one layer off" hint="Attacks stopped when a single layer is disabled (3 attacks).">{one.length ? <AblBars rows={one} /> : <Empty title="No ablation yet" />}</Section>
        <Section title="Only one layer on" hint="How strong each layer is on its own.">{only.length ? <AblBars rows={only} /> : <Empty title="Not measured" />}</Section>
      </div>
      <details className="card mt-4 p-5"><summary className="cursor-pointer text-[15px] font-medium">Limits</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-muted">{(b.limits?.length ? b.limits : ["Synthetic normal traffic and attackers written by us.", "Sim-to-real gap not measured.", "Python reference gateway; production targets Rust."]).map((l) => <li key={l}>{l}</li>)}</ul></details>
    </div>
  );
}
const ablLabel = (k: string) => (k.startsWith("none") ? "Everything on" : k.startsWith("ONLY ") ? `Only ${k.slice(5)}` : (LAYER_LABEL[k] ?? k));
function AblBars({ rows }: { rows: Abl[] }) {
  return <div className="space-y-1">{rows.map((a) => { const v = a.blocked_rate ?? 0; const c = v >= 0.95 ? "var(--moss)" : v >= 0.6 ? "var(--amber)" : "var(--blood)";
    return <HBar key={a.layer_off} label={ablLabel(a.layer_off)} value={v} max={1} color={c} right={`${Math.round(v * 100)}%`} />; })}</div>;
}
