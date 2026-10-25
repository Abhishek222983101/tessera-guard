"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/useApiB";
import { post, get, del, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { markDone } from "@/lib/guide";
import { PageHead, Section, Btn, SampleBadge, ErrorBox, Empty } from "@/components/ui/bits";
import { TestGuide, Pill, Hint } from "@/components/ui/kit";
import { Play, Trash2, Plus } from "lucide-react";
import type { ChangeEvent, ToolSpec, Case } from "@/lib/types";

const ROLES = [["role.procurement", "Procurement"], ["role.support", "Support"], ["role.finance_ap", "Finance AP"], ["role.research", "Research"]];
const KINDS = [["new_tool_version", "A tool was updated"], ["new_task_type", "A new kind of task"], ["volume_surge", "Expected busy period"], ["model_update", "The agent's AI model changed"]];
function useNow() { const [n, setN] = useState(() => Date.now() / 1000); useEffect(() => { const i = setInterval(() => setN(Date.now() / 1000), 1000); return () => clearInterval(i); }, []); return n; }
const fmt = (s: number) => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };

interface RunInfo { case_ids: string[]; extra?: { declared?: boolean }; state: string }
type Outcome = { variant: "declared" | "undeclared"; cases: Case[] } | null;

export default function Changes() {
  const { data: list, error, sample, reload } = useApi<ChangeEvent[]>("/changes", []);
  const { data: tools } = useApi<ToolSpec[]>("/tools", []);
  const [f, setF] = useState({ role: ROLES[0][0], kind: KINDS[0][0], tool: "erp.create_po_v2", description: "", duration_min: 60 });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [runs, setRuns] = useState<{ id: string; variant: "declared" | "undeclared" }[]>([]); const [out, setOut] = useState<Record<string, Outcome>>({});
  const now = useNow(); const states = useStore((s) => s.runs);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await post("/changes", { ...f, tool: f.kind === "new_tool_version" ? f.tool : undefined }); markDone("change"); setF({ ...f, description: "" }); reload(); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Couldn't declare the change"); } finally { setBusy(false); }
  }
  async function remove(id: string) { try { await del(`/changes/${id}`); reload(); } catch (x) { setErr(x instanceof ApiError ? x.message : "Couldn't close the window"); } }
  async function runS7(variant: "declared" | "undeclared") {
    setErr(null);
    try { const r = await post<{ run_id: string }>("/scenarios/S7/run", { attacker: variant, pace: 0.15 }); markDone("change"); setRuns((x) => [...x.filter((y) => y.variant !== variant), { id: r.run_id, variant }]); setOut((o) => ({ ...o, [variant]: null })); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Couldn't start the scenario"); }
  }
  useEffect(() => {
    runs.forEach(async (r) => {
      if (states[r.id]?.state !== "finished" || out[r.variant]) return;
      try { const info = await get<RunInfo>(`/runs/${r.id}`); const all = await get<Case[]>("/cases"); setOut((o) => ({ ...o, [r.variant]: { variant: r.variant, cases: all.filter((c) => info.case_ids.includes(c.id)) } })); reload(); } catch {}
    });
  }, [states, runs, out, reload]);
  const open = list.filter((c) => c.end_ts > now);
  const input = "w-full rounded-md border border-line2 bg-panel2 px-3 py-2 text-[15px] outline-none focus:border-ice";
  const running = (v: string) => runs.some((r) => r.variant === v && states[r.id]?.state !== "finished" && !out[v]);
  return (
    <div>
      <PageHead title="Declared changes" sub="Tell TESSERA about a change first and it stays quiet." right={sample ? <SampleBadge /> : undefined} />
      <TestGuide id="changes" steps={["Press “Run declared”.", "Press “Run undeclared”.", "Compare the two result cells."]}
        expect="Declared: no alerts. Undeclared: one unexplained-shift case, not an attack, no containment. The agent keeps working in both." />
      {error && <div className="mb-4"><ErrorBox message={error} onRetry={reload} /></div>}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Variant title="Declared" hint="Ops says ‘Procurement is moving to purchase-order tool v2’ before the agent uses it." onRun={() => runS7("declared")} disabled={sample} running={running("declared")} outcome={out.declared} />
        <Variant title="Undeclared" hint="The same new tool appears and nobody told TESSERA. It is flagged for review, not blocked." onRun={() => runS7("undeclared")} disabled={sample} running={running("undeclared")} outcome={out.undeclared} primary />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        <Section title="Declare a change" hint="Opens a window in which learned checks expect this change. Contract, provenance, decoy and content checks are never relaxed.">
          <form onSubmit={add} className="space-y-3 text-[15px]">
            <label className="block"><span className="mb-1 block text-muted">Agent role</span><select className={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-muted">What changed</span><select className={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {f.kind === "new_tool_version" && <label className="block"><span className="mb-1 block text-muted">Tool</span>
              <select className={`${input} mono`} value={f.tool} onChange={(e) => setF({ ...f, tool: e.target.value })}>{(tools.length ? tools.map((t) => t.name) : ["erp.create_po_v2"]).map((n) => <option key={n}>{n}</option>)}</select></label>}
            <label className="block"><span className="mb-1 block text-muted">Note</span><input className={input} value={f.description} maxLength={200} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Month-end close" /></label>
            <label className="block"><span className="mb-1 block text-muted">Minutes open</span><input type="number" min={5} max={1440} className={`${input} mono`} value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: Math.min(1440, Math.max(5, +e.target.value || 5)) })} /></label>
            <Btn type="submit" kind="solid" disabled={busy || sample}><Plus size={16} />{busy ? "Declaring…" : "Declare"}</Btn>
            {err && <div role="alert" className="text-[15px] text-blood">{err}</div>}
          </form>
        </Section>
        <Section title={`Open windows · ${open.length}`}>
          {open.length ? <ul className="divide-y divide-line">{open.map((c) => (<li key={c.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0"><div className="truncate text-[15px]">{c.description || KINDS.find((k) => k[0] === c.kind)?.[1]}</div><div className="mono text-[13px] text-faint">{c.role}{c.tool ? ` · ${c.tool}` : ""}</div></div>
            <div className="flex items-center gap-2"><Pill tone="blue"><span className="mono tnum">{fmt(c.end_ts - now)}</span></Pill>
              <button onClick={() => remove(c.id)} aria-label="Close this window" className="rounded-md p-1.5 text-faint hover:bg-panel2 hover:text-blood"><Trash2 size={16} /></button></div></li>))}</ul>
            : <Empty title="No windows open" />}
        </Section>
      </div>
    </div>
  );
}

function Variant({ title, hint, onRun, disabled, running, outcome, primary }: { title: string; hint: string; onRun: () => void; disabled: boolean; running: boolean; outcome: Outcome | undefined; primary?: boolean }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 text-[16px] font-semibold">{title}<Hint>{hint}</Hint></h2>
        <Btn kind={primary ? "solid" : "ghost"} onClick={onRun} disabled={disabled || running}><Play size={14} />{running ? "Running…" : `Run ${title.toLowerCase()}`}</Btn></div>
      <div className="min-h-[72px] rounded-md bg-panel2 p-4">
        {!outcome ? <span className="text-[15px] text-faint">{running ? "Running…" : "Result appears here"}</span>
          : outcome.cases.length ? <div><div className="text-[13px] text-faint">Alerts raised</div><div className="mono text-[28px] font-semibold text-amber">{outcome.cases.length}</div>
            {outcome.cases.map((c) => <Link key={c.id} href={`/cases/${c.id}`} className="text-[15px] text-ice underline">{c.kind === "shift" ? "Unexplained shift" : "Attack"} · risk {Math.round(c.max_risk)} · L{c.containment_level}</Link>)}</div>
          : <div><div className="text-[13px] text-faint">Alerts raised</div><div className="mono text-[28px] font-semibold text-moss">0</div></div>}
      </div>
    </div>
  );
}
