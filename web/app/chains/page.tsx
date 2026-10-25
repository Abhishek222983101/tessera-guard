"use client";
import { useState } from "react";
import { toast } from "sonner";
import IsoChain from "@/components/landing/IsoChain";
import { useApi } from "@/lib/useApiB";
import { post, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { markDone } from "@/lib/guide";
import { mockChainGraph } from "@/lib/mockB";
import { PageHead, Section, Btn, SampleBadge, ErrorBox, Empty } from "@/components/ui/bits";
import { TestGuide, Pill } from "@/components/ui/kit";
import { Play, Snowflake } from "lucide-react";

interface G { nodes: { agent_id: string; name: string; role: string; taint: string; level: number; patient_zero: boolean }[]; edges: { from: string; to: string; ts: number; taint: string; task: string; chunks: string[] }[]; cascade: { patient_zero: string | null; affected: string[] } }


export default function Chains() {
  const { data: g, error, sample, reload } = useApi<G>("/chains", mockChainGraph as G);
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [runId, setRunId] = useState<string | null>(null); const [sel, setSel] = useState<number | null>(null);
  const run = useStore((s) => (runId ? s.runs[runId] : undefined));
  async function act(kind: "run" | "freeze") {
    setBusy(kind); setMsg(null);
    try { if (kind === "run") { const r = await post<{ run_id: string }>("/scenarios/S6/run", { pace: 0.4 }); setRunId(r.run_id); markDone("chain"); [1500, 4000, 7000].forEach((t) => setTimeout(reload, t)); } else { await post("/chains/freeze", { patient_zero: g.cascade.patient_zero }); setMsg("Frozen. Patient zero and everyone it handed work to are narrowed."); toast.success("Cascade frozen", { description: "Research and Finance are now quarantined (L3)." }); reload(); } }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "That didn't work"); } finally { setBusy(null); }
  }
  const pz = g.nodes.find((n) => n.agent_id === g.cascade.patient_zero);
  const edge = (sel !== null ? g.edges[sel] : null) ?? g.edges.find((e) => e.taint === "tainted") ?? null;
  return (
    <div>
      <PageHead title="Agent chains" sub="Where an infection started, and who it reached." right={<>{sample && <SampleBadge />}
        <Btn kind="solid" onClick={() => act("run")} disabled={!!busy || sample}><Play size={16} />{busy === "run" ? "Starting…" : "Run chain attack"}</Btn></>} />
      <TestGuide id="chains" steps={["Press “Run chain attack”.", "Watch the red arrow from Research to Finance.", "Press the Finance machine to see what travelled.", "Press “Freeze cascade”."]}
        expect="Research is patient zero. Finance's payment to an attacker account is blocked. Other agents stay clean." />
      {error && <div className="mb-4"><ErrorBox message={error} onRetry={reload} /></div>}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-hidden p-4" aria-label="Fleet map">
          {g.nodes.length ? <IsoChain nodes={g.nodes.map((n) => ({ id: n.agent_id, name: n.name, taint: n.taint, pz: n.patient_zero, level: n.level }))} edges={g.edges.map((e) => ({ from: e.from, to: e.to, taint: e.taint }))} onSelectEdge={setSel} />
            : <div className="p-6"><Empty title="No agents yet" hint="Reset the lab to seed the fleet." /></div>}
        </div>
        <div className="space-y-4">
          <Section title="Affected" hint="Patient zero is the first agent that was tricked.">
            {g.cascade.patient_zero ? (<div className="space-y-3 text-[15px]"><div><div className="text-[13px] text-faint">Patient zero</div><div className="text-[18px] font-medium text-blood">{pz?.name ?? g.cascade.patient_zero}</div></div>
              <div><div className="mb-1 text-[13px] text-faint">Received tainted work</div>{g.cascade.affected.length ? <div className="flex flex-wrap gap-1.5">{g.cascade.affected.map((a) => <Pill key={a} tone="orange">{g.nodes.find((n) => n.agent_id === a)?.name ?? a}</Pill>)}</div> : <span className="text-muted">No one yet</span>}</div>
              <Btn kind="danger" onClick={() => act("freeze")} disabled={!!busy || sample}><Snowflake size={16} />Freeze cascade</Btn></div>)
              : <Empty title="No contamination" />}
            {msg && <p className="mt-3 text-[13px] text-muted">{msg}</p>}
          </Section>
          <Section title="Handoff" hint="Click an arrow in the graph.">
            {edge ? <div className="space-y-2 text-[15px]"><div className="rounded-md bg-panel2 p-3">“{edge.task}”</div><div className="mono text-[13px] text-faint">{edge.from} → {edge.to}</div>
              <Pill tone={edge.taint === "tainted" ? "orange" : "green"}>{edge.taint === "tainted" ? "Tainted: writes need a human" : "Clean"}</Pill></div> : <p className="text-[15px] text-muted">No arrow selected.</p>}
          </Section>
          {run && <div role="status" className="text-[13px] text-faint">Run: {run.state}{run.state !== "finished" ? ` · ${Math.round(run.progress * 100)}%` : ""}</div>}
        </div>
      </div>
    </div>
  );
}
