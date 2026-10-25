"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Printer, Unlock } from "lucide-react";
import { TestGuide, Section, Pill, Hint } from "@/components/ui/kit";
import { toast } from "sonner";
import { markDone } from "@/lib/guide";
import { bandLabel } from "@/components/feed/RiskGauge";
import { get, post } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useApi, ErrorNote } from "@/lib/useApi";
import type { Case, Counterfactual, DocSummary, Receipt, Verdict } from "@/lib/types";
import DocViewer, { type DocViewerHandle, type Highlight } from "@/components/case/DocViewer";
import RiskWaterfall from "@/components/case/RiskWaterfall";
import ProvenanceGraph from "@/components/case/ProvenanceGraph";
import VerdictChip, { bandColor } from "@/components/feed/VerdictChip";
import ProvChip from "@/components/feed/ProvChip";
import LadderStepper from "@/components/feed/LadderStepper";
import UtilityMeter from "@/components/feed/UtilityMeter";
import ApprovalCard from "@/components/feed/ApprovalCard";
import Skeleton from "@/components/feed/Skeleton";
import Empty from "@/components/feed/Empty";

interface Chunk { id: string; source: string; label: string; trust: string; hidden_text: boolean; injection_score: number; text_excerpt: string; doc?: string; step?: number }
interface Thread { from: { doc: string; page: number; bbox: number[]; text: string; chunk: string }; to: { verdict_id: string; step: number; tool: string; arg: string } }
interface Detail { case: Case; verdicts: Verdict[]; chunks: Chunk[]; thread: Thread[]; containment: { from: number; to: number; reason: string; scope: string }[]; receipts: Receipt[]; utility: Case["utility"] }

const hid = (t: Thread["from"]) => `${t.chunk}:${(t.bbox ?? []).join(",")}`;

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const d = useApi<Detail>(`/cases/${id}`, { poll: 3000 });
  const docs = useApi<DocSummary[]>("/documents");
  const approvals = useStore((s) => s.approvals);
  const detail = d.data;
  useEffect(() => { if (detail) markDone("open-case"); }, [detail]);
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [flow, setFlow] = useState(false);
  const docRef = useRef<DocViewerHandle>(null); const wrap = useRef<HTMLDivElement>(null);
  const [curve, setCurve] = useState<{ d: string; key: string }[]>([]);

  const verdicts = useMemo(() => detail?.verdicts ?? [], [detail]);
  const peak = useMemo(() => verdicts.reduce<Verdict | null>((b, v) => (!b || v.risk > b.risk ? v : b), null), [verdicts]);
  const selId = sel ?? peak?.id ?? null;
  const cur = verdicts.find((v) => v.id === selId) ?? null;
  const highlights: Highlight[] = useMemo(() => {
    const m = new Map<string, Highlight>();
    for (const t of (detail?.thread ?? []).filter((t) => t.from.bbox?.length)) m.set(hid(t.from), { id: hid(t.from), page: t.from.page, bbox: t.from.bbox, text: t.from.text, kind: "hidden text" });
    return [...m.values()];
  }, [detail]);
  const docId = detail?.thread?.[0]?.from.doc ?? detail?.case.root_cause?.doc ?? null;
  const docMeta = docs.data?.find((x) => x.id === docId);
  const activeThreads = useMemo(() => ((detail?.thread ?? []).filter((t) => t.from.bbox?.length)).filter((t) => (hover ? hid(t.from) === hover : t.to.verdict_id === selId)), [detail, selId, hover]);
  const activeHl = hover ?? (activeThreads[0] ? hid(activeThreads[0].from) : null);

  const measure = useCallback(() => {
    const root = wrap.current; if (!root) return; const rr = root.getBoundingClientRect(); const out: { d: string; key: string }[] = [];
    for (const t of activeThreads) {
      const a = docRef.current?.highlightEl(hid(t.from)); const b = root.querySelector<HTMLElement>(`[data-step="${t.to.step}"]`); if (!a || !b) continue;
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      const x1 = ar.right - rr.left, y1 = ar.top + ar.height / 2 - rr.top, x2 = br.left - rr.left, y2 = br.top + 18 - rr.top; const dx = Math.max(60, (x2 - x1) * 0.5);
      out.push({ d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, key: `${hid(t.from)}>${t.to.step}` });
    }
    setCurve(out);
  }, [activeThreads]);
  useLayoutEffect(() => { measure(); }, [measure, detail, selId]);
  useEffect(() => { const h = () => measure(); window.addEventListener("resize", h); window.addEventListener("scroll", h, true); const t = setTimeout(measure, 400); return () => { window.removeEventListener("resize", h); window.removeEventListener("scroll", h, true); clearTimeout(t); }; }, [measure]);

  async function setLevel(l: number) { if (!detail) return; setBusy(true); setMsg(null); try { await post(`/agents/${detail.case.agent_id}/containment`, { level: l, reason: "Set from the case board" }); await d.reload(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } }
  async function release() { if (!detail) return; setBusy(true); setMsg(null); try { await post(`/agents/${detail.case.agent_id}/release`, { approver: "console-user" }); await d.reload(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } }

  if (d.loading && !detail) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-96" /></div>;
  if (!detail) return <div><ErrorNote error={d.error} onRetry={d.reload} /><Link href="/cases" className="btn btn-ghost mt-4 inline-flex">Back to cases</Link></div>;
  const c = detail.case; const chunkLabels = Object.fromEntries(detail.chunks.map((k) => [k.id, k.label]));
  const myApprovals = Object.values(approvals).filter((a) => detail.verdicts.some((v) => v.id === a.verdict_id));
  const cf: Counterfactual[] = cur?.counterfactual ?? [];
  const sev = c.severity; const col = bandColor(sev);
  const blocked = verdicts.filter((v) => v.decision === "DENY").length;

  return (
    <div ref={wrap} className="relative print:p-0">
      <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible print:hidden" aria-hidden>
        {curve.map((cv) => (<g key={cv.key}><path d={cv.d} fill="none" stroke="var(--blood)" strokeWidth="3" pathLength={1} strokeDasharray={1} style={{ animation: "draw 700ms ease-out forwards" }} /><circle r="5" fill="var(--blood)"><animateMotion dur="1.4s" repeatCount="indefinite" path={cv.d} /></circle></g>))}
      </svg>
      <style>{`@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}} @media print{aside,nav{display:none!important} }`}</style>
      <Link href="/cases" className="mb-5 inline-flex items-center gap-1.5 text-[15px] text-muted hover:text-bone print:hidden"><ArrowLeft size={15} />Cases</Link>

      <TestGuide id="case" steps={["Hover the red box on the page: a line draws to the action it caused.", "Click different steps in the timeline.", "Check the score breakdown and the 'What would make this OK' rows.", "At the bottom, tamper with a receipt, then press Verify."]}
        expect="Blocked steps are red, held steps amber. After tampering, verification fails at exactly the row you changed." />

      <header className="mb-8 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2"><Pill tone={c.status === "contained" ? "amber" : c.status === "resolved" ? "green" : "red"}>{c.status === "contained" ? "Contained" : c.status === "resolved" ? "Resolved" : "Open"}</Pill>
            <Pill tone={sev === "critical" ? "red" : sev === "high" ? "orange" : "amber"}>{bandLabel(sev)}</Pill>
            {c.kind === "shift" || c.kind === "unexplained_shift" ? <Pill tone="violet">Not an attack</Pill> : null}{c.owasp.map((o) => <Pill key={o} tone="gray">{o}</Pill>)}</div>
          <h1 className="text-[28px] font-semibold leading-tight">{c.title}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{c.summary}</p>
          <p className="mono mt-2 text-[13px] text-faint">{c.agent_id} · {blocked} blocked · {c.session_id}</p>
        </div>
        <div className="flex items-center gap-5"><div className="text-right"><div className="text-[56px] font-semibold leading-none tracking-tight tnum" style={{ color: col }}>{Math.round(c.max_risk)}</div><div className="mt-1 text-[13px] text-muted">peak risk of 100</div></div>
          <button onClick={() => window.print()} className="btn btn-ghost print:hidden" aria-label="Print this case"><Printer size={15} />Print</button></div>
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <section aria-label="Source document" className="min-w-0">
          <Section title="Source" hint="The document the agent read. The red box is text a person cannot see.">
            {docId ? <DocViewer ref={docRef} docId={docId} title={docMeta?.title ?? docId} pages={docMeta?.pages ?? 3} highlights={highlights} activeId={activeHl} onActivate={setHover} page={undefined} />
              : <div className="card"><Empty title="No source document">This case wasn&apos;t caused by document content.</Empty></div>}
          </Section>
        </section>

        <section aria-label="Steps" className="min-w-0">
          <Section title="Timeline" hint="Click a step to look closer. Red steps were blocked, amber ones are held for a person.">
            <ol className="card divide-y divide-line overflow-hidden">
              {verdicts.map((v) => {
                const inj = detail.chunks.some((k) => k.step === v.step && k.hidden_text); const on = v.id === selId;
                return (
                  <li key={v.id} data-step={v.step}>
                    <button onClick={() => { setSel(v.id); setHover(null); }} aria-pressed={on} className={`grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-panel2 ${on ? "bg-panel2" : ""}`} style={{ boxShadow: on ? "inset 2px 0 0 var(--bone)" : undefined }}>
                      <span className="text-[13px] text-faint tnum">{v.step}</span>
                      <span className="min-w-0"><span className="mono block truncate text-[15px] font-medium">{v.tool}</span>
                        <span className="block truncate text-[13px] text-muted">{inj ? <b className="font-medium text-blood">Hidden instructions entered here · </b> : null}{v.reason_code.replaceAll("_", " ").toLowerCase()}</span></span>
                      <span className="flex items-center gap-3"><VerdictChip decision={v.decision} compact /><span className="w-8 text-right text-[15px] font-semibold tnum" style={{ color: bandColor(v.band) }}>{Math.round(v.risk)}</span></span>
                    </button>
                  </li>);
              })}
            </ol>
          </Section>

          {cur && (
            <Section title="Why" hint={`Step ${cur.step}: ${cur.tool}. Pick another step above to compare.`}>
              <div className="card space-y-6 p-5" aria-live="polite">
                <div className="flex flex-wrap items-center gap-3"><span className="mono text-[15px] font-medium">{cur.tool}</span><VerdictChip decision={cur.decision} /></div>
                <RiskWaterfall v={cur} />
                {Object.keys(cur.args).length > 0 && (
                  <div><h3 className="mb-2 flex items-center gap-2 text-[15px] font-medium text-muted">Arguments<Hint>Where each value came from. Red means it came from untrusted text.</Hint></h3>
                    <ul className="divide-y divide-line rounded-lg border border-line">{Object.entries(cur.args).map(([k, val]) => { const o = cur.arg_origins?.[k]; return (
                      <li key={k} className="flex items-center gap-3 px-3 py-2 text-[15px]"><span className="w-24 shrink-0 text-muted">{k}</span>
                        <span className="mono min-w-0 flex-1 truncate text-bone" title={typeof val === "string" ? val : JSON.stringify(val)}>{typeof val === "string" ? val : JSON.stringify(val)}</span>{o && <span className="min-w-0 max-w-[45%] shrink-0"><ProvChip origin={o} name={k} label={o.source_label ? o.source_label : undefined} /></span>}</li>); })}</ul></div>)}
                <div><h3 className="mb-2 flex items-center gap-2 text-[15px] font-medium text-muted">What would make this OK<Hint>The smallest changes that would have lowered this step&apos;s risk.</Hint></h3>
                  {cf.length === 0 ? <p className="text-[15px] text-muted">Already fine, or no safe version exists.</p> : <ul className="divide-y divide-line rounded-lg border border-line">{cf.slice(0, 3).map((x, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-[15px]"><span className="flex-1 text-bone">{x.label}</span>
                      <span className="whitespace-nowrap tnum"><span className="text-muted">{Math.round(cur.risk)} → </span><b className="font-semibold" style={{ color: bandColor(x.risk_after >= 80 ? "critical" : x.risk_after >= 60 ? "high" : x.risk_after >= 30 ? "elevated" : "normal") }}>{Math.round(x.risk_after)}</b></span></li>))}</ul>}</div>
                <p className="text-[13px] text-muted">Policy engine: <span className="mono">{cur.cedar?.decision || "n/a"}</span>{cur.cedar?.policies?.length ? <> ({cur.cedar.policies.join(", ")})</> : null} · {cur.latency_ms.toFixed(1)} ms</p>
              </div>
            </Section>)}
        </section>
      </div>

      <Section title="Containment" hint="Containment narrows what the agent may do one step at a time, so its real work can carry on.">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="card min-w-0 space-y-4 p-5"><LadderStepper level={c.containment_level} onChange={setLevel} disabled={busy} />
            <div className="flex flex-wrap items-center gap-3 print:hidden"><button onClick={release} disabled={busy || c.containment_level === 0} className="btn btn-ghost"><Unlock size={15} />Release agent</button></div>
            {msg && <p role="alert" className="text-[15px] text-blood">{msg}</p>}</div>
          <div className="min-w-0 space-y-4"><div className="card p-5"><h3 className="mb-3 text-[15px] font-medium text-muted">Did the real work survive?</h3><UtilityMeter utility={detail.utility as never} /></div>
            {myApprovals.map((a) => <ApprovalCard key={a.id} approval={a} onApprove={async () => { await post(`/approvals/${a.id}/approve`); await d.reload(); }} onReject={async () => { await post(`/approvals/${a.id}/reject`); await d.reload(); }} />)}</div>
        </div>
      </Section>

      <Section title="Data flow" hint="Blue sources are trusted, red are untrusted. A thick line means the value decided where the action went."
        right={<button onClick={() => setFlow((f) => !f)} className="btn btn-ghost !py-1 text-[13px]" aria-expanded={flow}>{flow ? "Hide" : "Show"}</button>}>
        {flow && <div className="card h-[560px] overflow-hidden"><ProvenanceGraph verdicts={verdicts} chunkLabels={chunkLabels} selectedId={selId} onSelect={(i) => setSel(i)} /></div>}</Section>

      <Receipts receipts={detail.receipts} />
    </div>);
}

function Receipts({ receipts }: { receipts: Receipt[] }) {
  const [ver, setVer] = useState<{ ok: boolean; checked: number; broken_at: number | null; reason?: string } | null>(null);
  const [idx, setIdx] = useState<number>(receipts[Math.min(4, receipts.length - 1)]?.idx ?? 1); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const verify = useCallback(async () => { setBusy(true); try { const r = await fetch0(); setVer(r); setErr(null); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }, []);
  useEffect(() => { let on = true; fetch0().then((r) => on && setVer(r)).catch((e) => on && setErr((e as Error).message)); return () => { on = false; }; }, []);
  async function tamper() { setBusy(true); try { await post("/receipts/tamper", { idx }); markDone("tamper"); toast(`Row ${idx} edited behind the scenes.`); await verify(); } catch (e) { setErr((e as Error).message); setBusy(false); } }
  return (
    <Section title="Receipts" hint="Every decision is a signed receipt chained to the one before. Change any row and the chain breaks.">
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          {ver && (ver.ok ? <Pill tone="green">Chain intact · {ver.checked} checked</Pill> : <Pill tone="red">Broken at row {ver.broken_at}{ver.reason ? ` · ${ver.reason}` : ""}</Pill>)}
          <div className="ml-auto flex flex-wrap items-center gap-2 print:hidden"><label className="text-[15px] text-muted" htmlFor="tidx">Tamper with row</label>
            <select id="tidx" value={idx} onChange={(e) => setIdx(+e.target.value)} className="mono rounded-md border border-line2 bg-panel2 px-2.5 py-1.5 text-[15px] text-bone">{receipts.map((r) => <option key={r.id} value={r.idx}>{r.idx}</option>)}</select>
            <button onClick={tamper} disabled={busy} className="btn btn-danger !py-1.5">Tamper</button>
            <button onClick={verify} disabled={busy} className="btn btn-ghost !py-1.5">Verify</button></div></div>
        {err && <p role="alert" className="mt-2 text-[15px] text-blood">{err}</p>}
        <ul className="mt-4 max-h-64 overflow-auto rounded-lg border border-line">{receipts.map((r) => { const bad = ver && !ver.ok && ver.broken_at != null && r.idx >= ver.broken_at; return (
          <li key={r.id} className={`mono grid grid-cols-[36px_100px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b border-line px-3 py-2 text-[13px] last:border-0 ${bad ? "bg-bloodbg text-blood" : ""}`}>
            <span className="text-faint">{r.idx}</span><span className="font-medium">{r.kind}</span><span className="truncate text-muted" title={r.prev_hash}>prev {r.prev_hash.slice(0, 12)}</span><span className="truncate" title={r.payload_hash}>hash {r.payload_hash.slice(0, 12)}</span></li>); })}</ul>
      </div>
    </Section>);
}
const fetch0 = () => get<{ ok: boolean; checked: number; broken_at: number | null; reason?: string }>("/receipts/verify");
