"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { get, post, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { PageHeader, Pill, TestGuide } from "@/components/ui/kit";
import { markDone } from "@/lib/guide";
import type { Agent } from "@/lib/types";

const ROLE: Record<string, string> = { "role.procurement": "Checks prices, drafts purchase requests", "role.support": "Answers customers from the CRM and KB", "role.finance_ap": "Pays approved supplier invoices", "role.research": "Reads market news, hands tasks to Finance" };
const TEMPLATES = [["role.procurement", "Procurement"], ["role.support", "Support"], ["role.finance_ap", "Finance AP"], ["role.research", "Research"]] as const;

export default function Agents() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const verdictCount = useStore((s) => s.verdicts.length);
  const load = useCallback(() => { get<Agent[]>("/agents").then((a) => { setAgents(a); setErr(null); }).catch((e) => setErr(e instanceof ApiError ? e.message : "Could not load agents")); }, []);
  useEffect(() => { load(); }, [load, verdictCount]);
  async function spawn(t: string) { setBusy(true); try { await post("/agents", { template: t }); markDone("cold-start"); load(); } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not create the agent"); } finally { setBusy(false); } }
  return (
    <div>
      <PageHeader title="Agents" what="Every agent the lab watches. Open one to see its working hours, learned behaviour and drift." />
      <TestGuide id="agents" steps={["Open the Procurement agent.", "Find the working-hours clock and drag it.", "Come back and create a new agent with no history.", "Open it: maturity shows 0 of 20."]} expect="Seeded agents are mature (60 sessions). A new agent has no history, so its learned checks stay in shadow." />
      {err && <div role="alert" className="mb-4 rounded-lg border border-blood/30 bg-bloodbg px-4 py-3 text-[15px] text-blood">{err}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {(agents ?? []).map((a) => (
          <Link key={a.id} href={`/agents/${a.id}`} className="card group flex items-center gap-4 p-5 transition-colors hover:border-line2 hover:bg-panel2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="truncate text-[17px] font-semibold">{a.name}</span>
                <Pill tone={a.status === "active" ? "green" : a.status === "contained" ? "amber" : "red"}>{a.status === "active" ? "Working" : a.status === "contained" ? "Contained" : "Killed"}</Pill></div>
              <div className="mt-0.5 truncate text-[14px] text-muted">{ROLE[a.role] ?? a.role}</div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted"><span>Risk <b className={`tnum ${a.risk_now >= 60 ? "text-blood" : "text-bone"}`}>{Math.round(a.risk_now)}</b></span><span>Learned <b className="tnum text-bone">{a.sessions_seen}</b> sessions</span><span>{a.open_cases} open case{a.open_cases === 1 ? "" : "s"}</span><span className="mono text-faint">{a.id}</span></div>
            </div>
            <ArrowRight size={18} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
          </Link>))}
        {agents === null && !err && <div className="card p-5 text-muted">Loading…</div>}
      </div>
      <h2 className="mb-3 mt-10 text-[16px] font-semibold">Create an agent with no history</h2>
      <div className="flex flex-wrap gap-2">{TEMPLATES.map(([t, l]) => (<button key={t} disabled={busy} onClick={() => spawn(t)} className="btn btn-ghost"><Plus size={15} />{l}</button>))}</div>
    </div>
  );
}
