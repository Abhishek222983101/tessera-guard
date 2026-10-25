"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, Radio, Network, FileText, Keyboard } from "lucide-react";
import { get, post } from "@/lib/api";
import { replay, resetLocal, useStore } from "@/lib/store";
import { markDone } from "@/lib/guide";
import { fixtureEvents } from "@/lib/mock";
import fx from "@/lib/fixtures/s1.json";
import type { Case, DocSummary, Scenario, Utility, Verdict } from "@/lib/types";
import { PageHeader, TestGuide } from "@/components/ui/kit";
import DocViewer, { type Highlight } from "@/components/case/DocViewer";
import ProvenanceGraph from "@/components/case/ProvenanceGraph";
import RiskGauge from "@/components/feed/RiskGauge";
import LadderStepper from "@/components/feed/LadderStepper";
import UtilityMeter from "@/components/feed/UtilityMeter";
import VerdictChip, { bandColor } from "@/components/feed/VerdictChip";
import TwoLaneFeed from "@/components/feed/TwoLaneFeed";
import ProtectionSwitch, { type Protection } from "@/components/guide/ProtectionSwitch";

interface Detail { case: Case; verdicts: Verdict[]; chunks: { id: string; label: string }[]; thread: { from: { doc: string; page: number; bbox: number[]; text: string; chunk: string } }[] }
const FALLBACK: Detail | null = (fx as unknown as { case?: Detail }).case ?? null;
const META: Record<string, { expect: string }> = {
  S1: { expect: "HR read and POST blocked; 4 of 5 steps done." }, S2: { expect: "Changed tool quarantined; payments continue." },
  S3: { expect: "High risk from the first call; off-role reads denied." }, S4: { expect: "Held around session 13 by drift." },
  S5: { expect: "Mimicry fools learned layers; contract still blocks." }, S6: { expect: "Research named patient zero; payment blocked." },
  S7: { expect: "Declared change stays quiet." }, S8: { expect: "Caught on day zero; learned layers in shadow." },
};

export default function DemoPage() {
  const verdicts = useStore((s) => s.verdicts); const cases = useStore((s) => s.cases); const runs = useStore((s) => s.runs); const conn = useStore((s) => s.conn); const containment = useStore((s) => s.containment);
  const [scen, setScen] = useState<Scenario[]>([]); const [prot, setProt] = useState<Protection>("tessera"); const protRef = useRef<Protection>("tessera"); const [view, setView] = useState<"doc" | "graph">("doc"); const [busy, setBusy] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocSummary[]>([]); const [detail, setDetail] = useState<Detail | null>(null); const [offline, setOffline] = useState(false); const [active, setActive] = useState<string | null>(null);
  useEffect(() => { get<Scenario[]>("/scenarios").then(setScen).catch(() => setOffline(true)); get<DocSummary[]>("/documents").then(setDocs).catch(() => {}); }, []);
  const latest = useMemo(() => Object.values(cases).sort((a, b) => b.updated_ts - a.updated_ts)[0], [cases]);
  useEffect(() => { if (!latest) return; let on = true; const load = () => get<Detail>(`/cases/${latest.id}`).then((d) => on && setDetail(d)).catch(() => { if (on && FALLBACK && latest.id === FALLBACK.case.id) setDetail(FALLBACK); }); load(); const t = setInterval(load, 2500); return () => { on = false; clearInterval(t); }; }, [latest]);
  const shown = latest ? detail : null;
  const last = verdicts[verdicts.length - 1]; const peak = verdicts.reduce((m, v) => Math.max(m, v.risk), 0);
  const level = containment.length ? containment[containment.length - 1].to : last?.containment_level ?? 0;
  const run = Object.values(runs).slice(-1)[0]; const utility = (run?.utility as Utility | undefined) ?? (shown?.case.utility as unknown as Utility | undefined);
  const highlights: Highlight[] = [...new Map((shown?.thread ?? []).filter((t) => t.from.bbox?.length).map((t) => [`${t.from.chunk}:${t.from.bbox.join(",")}`, { id: `${t.from.chunk}:${t.from.bbox.join(",")}`, page: t.from.page, bbox: t.from.bbox, text: t.from.text, kind: "hidden text" }])).values()];
  const docId = shown?.thread?.[0]?.from.doc; const docMeta = docs.find((d) => d.id === docId);
  async function start(id: string) { setBusy(id); setActive(id); setNote(null); if (id === "S1") markDone("run-s1"); try { await post(`/scenarios/${id}/run`, { protection: protRef.current }); } catch (e) { setNote((e as Error).message + " Press R to play the recorded replay instead."); } finally { setBusy(null); } }
  async function rec() { resetLocal(); setNote("Playing a recorded replay of scenario S1. The core is not needed."); let evs = fixtureEvents(); try { const r = await fetch("/replay/s1.json"); if (r.ok) { const j = await r.json(); if (j.events?.length) evs = j.events; } } catch {} replay(evs, 1); }
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return; const n = parseInt(e.key); if (n >= 1 && n <= 8) start(`S${n}`); if (e.key === "r") rec(); if (e.key === "g") setView((v) => (v === "doc" ? "graph" : "doc")); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  const caption = verdicts.slice(-3).reverse();
  const list = scen.length ? scen : Array.from({ length: 8 }, (_, i) => ({ id: `S${i + 1}`, name: `Scenario ${i + 1}`, short: "", challenge: "" }) as Scenario);

  const field = verdicts.length ? caption[0] : null;
  return (
    <div>
      <PageHeader title="Live demo" what="Pick a scenario and watch the agent get hijacked, then caught.">
        <span className="flex items-center gap-2 text-[13px] text-muted"><Radio size={14} className={conn === "live" ? "text-moss" : "text-faint"} />{conn === "replay" ? "Replay" : conn === "live" ? "Live" : "Offline"}</span>
        <button onClick={rec} className="btn btn-ghost !py-1.5 text-[13px]"><Play size={14} />Replay</button>
        <button onClick={() => { post("/reset").catch(() => {}); resetLocal(); setActive(null); }} className="btn btn-ghost !py-1.5 text-[13px]"><RotateCcw size={14} />Reset</button>
      </PageHeader>
      <TestGuide id="stage" steps={["Press S1 (or the key 1).", "Read the sentence under 'Now': it updates each step.", "In the feed, the left column stays green; the right turns red.", "The red box on the page is the hidden sentence.", "Switch protection off and run S1 again."]}
        expect="Risk climbs to the high 90s, the ladder moves to Narrow, and 4 of 5 task steps finish with 1 waiting for a human. With protection off, risk stays 0 and data leaves." />
      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Scenarios"><ul className="card grid divide-y divide-line overflow-hidden sm:grid-cols-2 sm:divide-y-0 sm:[&>li:nth-child(odd)]:border-r sm:[&>li:nth-child(n+3)]:border-t sm:[&>li]:border-line">{list.map((s) => { const m = META[s.id] ?? META.S1; const on = active === s.id; return (
          <li key={s.id}><button onClick={() => start(s.id)} disabled={!!busy} className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-panel2 disabled:opacity-60 ${on ? "bg-panel2" : ""}`}>
            <span className="mono mt-0.5 w-7 shrink-0 text-[13px] text-faint">{s.id}</span><span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{s.name}</span><span className="block truncate text-[13px] text-muted">{m.expect}</span></span>
            {busy === s.id ? <span className="text-[13px] text-muted">starting</span> : <Play size={14} className="mt-1 text-faint" />}</button></li>); })}</ul></section>
        <div className="space-y-3"><ProtectionSwitch value={prot} onChange={(v) => { protRef.current = v; setProt(v); }} />
          <p className="flex items-center gap-2 text-[13px] text-faint"><Keyboard size={14} />1–8 run · R replay · G view · ⇧R reset</p></div>
      </div>
      {(note || offline) && <p role="status" className="mb-4 rounded-lg border border-amber/30 bg-amberbg px-4 py-2.5 text-[15px] text-amber">{note ?? "Core offline. Press Replay to see the demo without it."}</p>}

      <section aria-label="Now" aria-live="polite" className="card mb-6 px-6 py-5">
        <div className="mb-1 text-[13px] text-muted">Now</div>
        {!field ? <p className="text-[20px] text-muted">Choose a scenario above.</p> : (
          <div className="flex items-start gap-3"><span className="mt-2.5 h-2 w-2 shrink-0 rounded-full" style={{ background: bandColor(field.band) }} /><div className="min-w-0"><p className="text-[20px] leading-snug">{field.summary || `${field.tool} ${field.decision.toLowerCase()}`}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted"><span className="mono">{field.tool}</span><VerdictChip decision={field.decision} compact /><span className="tnum">risk {Math.round(field.risk)}</span></div></div></div>)}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="flex min-w-0 flex-col gap-6">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-medium text-muted">{view === "doc" ? "Where it started" : "How information flowed"}</h2>
            <div role="group" className="flex rounded-lg border border-line p-0.5">{([["doc", FileText, "Document"], ["graph", Network, "Flow"]] as const).map(([v, I, l]) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[13px] ${view === v ? "bg-panel3 text-bone" : "text-muted"}`}><I size={13} />{l}</button>)}</div></div>
          <div className="min-h-[320px]">{!shown ? <div className="card grid h-full min-h-[320px] place-items-center p-10 text-center text-[15px] text-muted">The poisoned page appears here, hidden sentence boxed in red.</div> :
            view === "doc" && docId ? <DocViewer docId={docId} title={docMeta?.title ?? docId} pages={docMeta?.pages ?? 3} highlights={highlights} activeId={highlights[0]?.id} /> :
            <div className="card h-[520px] overflow-hidden"><ProvenanceGraph verdicts={shown.verdicts} chunkLabels={Object.fromEntries(shown.chunks.map((c) => [c.id, c.label]))} /></div>}</div>
          <div className="flex h-[360px] flex-col"><TwoLaneFeed verdicts={verdicts} compact maxRows={60} emptyHint="Run a scenario. Every action appears here." /></div>
        </main>
        <aside className="flex flex-col gap-4">
          <section className="card flex flex-col items-center gap-1 p-5"><RiskGauge risk={peak} size={200} /><p className="text-[13px] text-muted">{last ? last.tool : "Waiting"}</p></section>
          <section className="card space-y-4 p-5"><LadderStepper level={level} compact /><UtilityMeter utility={utility} /></section>
          {shown && <section className="card p-5"><p className="text-[15px] font-medium leading-snug">{shown.case.title}</p><Link href={`/cases/${shown.case.id}`} className="btn btn-ghost mt-3 !py-1.5 text-[13px]">Open case</Link></section>}
        </aside>
      </div>
    </div>);
}
