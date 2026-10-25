"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronRight, Play } from "lucide-react";
import { toast } from "sonner";
import { post } from "@/lib/api";
import { GUIDE, markDone, resetGuide, useGuideDone } from "@/lib/guide";
import { PageHeader, Pill } from "@/components/ui/kit";

const PS = [
  ["Learn each agent's normal behaviour", "Agent page", "/agents/agt_proc_01"],
  ["Compare it with the declared role", "Role contracts", "/contracts"],
  ["Catch drift while credentials are valid", "Live demo", "/demo"],
  ["Explain every alert with a risk score", "Cases", "/cases"],
  ["Restrict without stopping real work", "Live demo", "/demo"],
  ["C-1 Valid credentials hide the attack", "Stolen token", "/hijack"],
  ["C-2 Hidden instructions in documents", "Attack Lab", "/lab"],
  ["C-3 Real change vs. real attack", "Declared changes", "/changes"],
  ["C-4 No history", "Agent page", "/agents/agt_proc_01"],
  ["C-5 Agent chains", "Agent chains", "/chains"],
  ["C-6 Mimicry and slow leaks", "Red-team", "/redteam"],
] as const;
const WORDS = [
  ["IAM", "The system that checks who you are and whether you may call this."],
  ["Token", "The digital badge an agent shows on every call."],
  ["Scope", "What the badge says the agent may touch. Often broader than the job."],
  ["Prompt injection", "Hidden instructions in content an agent reads, mistaken for orders."],
  ["Provenance", "Where a piece of data came from."],
  ["Role contract", "The agent's job description as data."],
  ["Cedar", "The open policy language contracts compile to. Forbid beats permit."],
  ["Containment", "Narrowing what an agent may do instead of switching it off."],
  ["Step-up", "A risky action paused until a human approves."],
  ["Decoy", "A fake file no real job touches. A touch proves snooping."],
] as const;
const GROUPS = ["See the problem", "Break it yourself", "Look inside", "Prove it"] as const;

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  const [o, setO] = useState(false);
  return (<section className="card mt-4"><button onClick={() => setO(!o)} aria-expanded={o} className="flex w-full items-center gap-2 px-5 py-4 text-left text-[15px] font-medium"><ChevronRight size={16} className={`text-faint transition-transform ${o ? "rotate-90" : ""}`} />{title}</button>{o && <div className="border-t border-line px-5 py-4">{children}</div>}</section>);
}

export default function GuidePage() {
  const done = useGuideDone(); const router = useRouter();
  const n = GUIDE.filter((g) => done[g.id]).length;
  const [busy, setBusy] = useState(false); const [open, setOpen] = useState<string | null>(null);
  async function runIt() {
    setBusy(true);
    try { await post("/scenarios/S1/run", { pace: 0.5 }); markDone("run-s1"); toast.success("Attack started"); router.push("/demo"); }
    catch (e) { toast.error((e as Error).message + " Start the core with just up, or open Live demo for the replay."); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader title="Start here" what="A test plan for judges. Run the attack, break it yourself, check the proof. Ticks fill in as you go.">
        <button onClick={runIt} disabled={busy} className="btn btn-primary"><Play size={15} fill="currentColor" />{busy ? "Starting" : "Run the attack"}</button>
      </PageHeader>
      <div className="mb-8 flex items-center gap-3"><div className="h-1 flex-1 overflow-hidden rounded-full bg-panel3"><div className="h-full rounded-full bg-moss transition-all duration-500" style={{ width: `${(n / GUIDE.length) * 100}%` }} /></div><span className="text-[15px] tnum text-muted">{n} of {GUIDE.length}</span></div>

      {GROUPS.map((g) => (
        <section key={g} className="mb-8">
          <h2 className="mb-2 text-[16px] font-semibold">{g}</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {GUIDE.filter((x) => x.group === g).map((it) => { const ok = !!done[it.id]; const o = open === it.id; return (
              <li key={it.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => markDone(it.id)} disabled={ok} aria-label={ok ? `${it.title}: done` : `Mark ${it.title} done`} className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${ok ? "border-moss bg-moss text-ink" : "border-line2 text-transparent hover:border-moss hover:text-moss"}`}><Check size={13} strokeWidth={3} /></button>
                  <button onClick={() => setOpen(o ? null : it.id)} aria-expanded={o} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className={`min-w-0 flex-1 truncate text-[15px] ${ok ? "text-muted line-through decoration-faint" : ""}`}>{it.title}</span>{it.ps.match(/^C-\d/) && <span className="hidden sm:block"><Pill>{it.ps.slice(0, 3)}</Pill></span>}</button>
                  <Link href={it.href} className="btn btn-ghost !px-3 !py-1 text-[13px]">Open</Link>
                </div>
                {o && <ol className="space-y-2 border-t border-line bg-panel2 px-4 py-3 pl-12 text-[15px] text-muted">{it.how.map((h, i) => <li key={i} className="flex gap-2"><span className="tnum text-faint">{i + 1}.</span><span>{h}</span></li>)}</ol>}
              </li>); })}
          </ul>
        </section>))}

      <Fold title="Problem statement and where to see it"><ul className="divide-y divide-line">{PS.map(([r, w, h]) => <li key={r}><Link href={h} className="flex items-center justify-between gap-3 py-2.5 text-[15px] hover:text-bone"><span>{r}</span><span className="text-[13px] text-muted">{w}</span></Link></li>)}</ul></Fold>
      <Fold title="Glossary"><dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{WORDS.map(([w, d]) => <div key={w}><dt className="text-[15px] font-medium">{w}</dt><dd className="text-[15px] text-muted">{d}</dd></div>)}</dl></Fold>
      <div className="mb-10 mt-6 text-right"><button onClick={resetGuide} className="text-[13px] text-faint hover:text-bone">Clear my ticks</button></div>
    </div>);
}
