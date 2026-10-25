"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/useApiB";
import { post, get, ApiError } from "@/lib/api";
import { useStore, getState } from "@/lib/store";
import { mockScenarios } from "@/lib/mockB";
import { LAYERS, type Scenario, type Utility, type Verdict } from "@/lib/types";
import { PageHead, Section, Btn, SampleBadge, ErrorBox, Empty, LAYER_COLOR, LAYER_LABEL } from "@/components/ui/bits";
import { TestGuide, Pill, Hint } from "@/components/ui/kit";
import { markDone } from "@/lib/guide";
import { Play, Download, Eraser } from "lucide-react";

const MODES: [string, string, string][] = [["static", "Direct", "Does the obvious attack once."], ["adaptive", "Adaptive", "Tries again with new tricks when blocked."], ["mimicry", "Mimicry", "Copies the agent's normal behaviour first."], ["slow_ramp", "Slow leak", "Steals a little more each session."]];
const LAYER_WHAT: Record<string, string> = { contract: "Is this inside the agent's job description?", provenance: "Did untrusted text choose where this goes?", decoy: "Did it touch bait files nobody should open?", content: "Did it read a document with hidden instructions?", chain: "Was it handed tainted work by another agent?", context: "Is a valid token being used from an odd place?", sequence: "Is this order of tools unusual?", params: "Are the amounts or destinations unusual?", intent: "Does this look like a different job?", drift: "Has it been creeping away from normal over time?" };
interface RunResult { first_caught_session?: number | null; sessions?: number; utility?: Utility; outcome?: { attack_steps?: number; attack_blocked?: number; exfil_succeeded?: boolean }; verdict_ids?: string[] }
interface Row { take: string; n: number; scenario: string; attacker: string; off: string[]; blocked: boolean; retention: number | null; carried: string; steps: number; at: string }

export default function RedTeam() {
  const { data: scenarios, sample, error, reload } = useApi<Scenario[]>("/scenarios", mockScenarios as Scenario[]);
  const [sid, setSid] = useState("S1"); const [mode, setMode] = useState("static"); const [off, setOff] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null); const [startIdx, setStartIdx] = useState(0); const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]); const counted = useRef<string | null>(null);
  const run = useStore((s) => (runId ? s.runs[runId] : undefined));
  const vs = useStore((s) => s.verdicts);
  const live: Verdict[] = useMemo(() => (runId ? vs.slice(startIdx) : []), [vs, runId, startIdx]);
  const running = !!runId && run?.state !== "finished";

  async function start() {
    setErr(null); setStartIdx(getState().verdicts.length); counted.current = null;
    try { const r = await post<{ run_id: string }>(`/scenarios/${sid}/run`, { attacker: mode, disabled_layers: off }); setRunId(r.run_id); }
    catch (e) { setRunId(null); setErr(e instanceof ApiError ? e.message : "Couldn't start the run"); }
  }
  // when finished, fetch result and add a row
  useEffect(() => {
    if (!runId || run?.state !== "finished" || counted.current === runId) return; counted.current = runId;
    (async () => {
      let r: RunResult = {}; try { r = await get<RunResult>(`/runs/${runId}`); } catch {}
      const mine = getState().verdicts.slice(startIdx);
      const firstBlock = mine.find((v) => v.decision === "DENY" || v.decision === "STEP_UP");
      const top = firstBlock ? [...firstBlock.signals].sort((a, b) => b.score - a.score)[0]?.layer : undefined;
      const isS4 = sid === "S4"; const caught = isS4 ? r.first_caught_session != null : (r.outcome?.exfil_succeeded === false || (!!firstBlock && r.outcome?.exfil_succeeded === undefined));
      const offTxt = off.map((l) => LAYER_LABEL[l]).join(" + ");
      const take = caught ? (off.length ? `Still caught with ${offTxt} off, so other layers covered for it.` : isS4 ? `Held at session ${r.first_caught_session} of ${r.sessions ?? 30}: no single step looked wrong, the creep did.` : `Caught with every layer on. ${LAYER_LABEL[top ?? "contract"] ?? "A layer"} fired first.`)
        : `Got through. With ${offTxt || "these settings"} off, nothing else stopped it, so ${off.length ? offTxt + " was carrying this attack" : "the system missed it"}.`;
      if (sid === "S4" || sid === "S5") markDone("evade");
      setRows((x) => [...x, { take, n: x.length + 1, scenario: sid, attacker: mode, off: [...off], blocked: caught, retention: r.utility?.retention ?? null,
        carried: firstBlock ? LAYER_LABEL[top ?? "contract"] ?? "-" : "nothing caught it", steps: mine.length, at: new Date().toLocaleTimeString() }]);
    })();
  }, [run?.state, runId, sid, mode, off, startIdx]);

  // per-layer sequence of scores
  const perLayer = useMemo(() => Object.fromEntries(LAYERS.map((l) => [l, live.map((v) => v.signals.find((s) => s.layer === l)?.score ?? 0)])), [live]);
  const toggle = (l: string) => setOff((o) => (o.includes(l) ? o.filter((x) => x !== l) : [...o, l]));
  const exportJson = () => { const b = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "tessera-redteam-results.json"; a.click(); URL.revokeObjectURL(a.href); };

  const sel = "w-full rounded-md border border-line2 bg-panel2 px-3 py-2 text-[15px] outline-none focus:border-ice";
  return (
    <div>
      <PageHead title="Red-team" sub="Attack it, then switch layers off to see which one mattered." right={sample ? <SampleBadge /> : undefined} />
      <TestGuide id="redteam" steps={["Pick S5 Mimicry and press Run.", "Switch off Contract, Provenance, Decoys, Content.", "Run again and compare the two rows.", "Run S4 Slow leak: it is held near session 13."]}
        expect="Mimicry is blocked with all layers on, and gets through when only learned layers remain." />
      {error && <div className="mb-4"><ErrorBox message={error} onRetry={reload} /></div>}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Section title="Attack">
            <div className="space-y-3">
              <label className="block"><span className="mb-1 block text-[13px] text-faint">Scenario</span><select className={sel} value={sid} onChange={(e) => setSid(e.target.value)}>{scenarios.filter((x) => x.id !== "S7").map((x) => <option key={x.id} value={x.id}>{x.id} · {x.name}</option>)}</select></label>
              <label className="block"><span className="mb-1 block flex items-center gap-1.5 text-[13px] text-faint">Attacker style <Hint>{MODES.find((m) => m[0] === mode)?.[2]} Styles a scenario doesn&apos;t support behave like Direct.</Hint></span><select className={sel} value={mode} onChange={(e) => setMode(e.target.value)}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            </div>
          </Section>
          <Section title="Layers" hint="Switch one off to see whether the attack still fails." right={off.length ? <button onClick={() => setOff([])} className="flex items-center gap-1 text-[13px] text-muted hover:text-bone"><Eraser size={13} />All on</button> : undefined}>
            <ul className="grid grid-cols-2 gap-1.5">{LAYERS.map((l) => (<li key={l}><label title={LAYER_WHAT[l]} className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line px-2.5 py-2 hover:bg-panel2">
              <input type="checkbox" className="peer sr-only" checked={!off.includes(l)} onChange={() => toggle(l)} />
              <span className="h-4 w-7 shrink-0 rounded-full bg-line2 p-0.5 transition-colors peer-checked:bg-moss peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ice"><i className={`block h-3 w-3 rounded-full bg-bone transition-transform ${off.includes(l) ? "" : "translate-x-3"}`} /></span>
              <span className={`text-[15px] ${off.includes(l) ? "text-faint line-through" : "text-bone"}`}>{LAYER_LABEL[l]}</span></label></li>))}</ul>
            <p className="mt-3 text-[12.5px] text-faint">Rules: contract, provenance, decoys, content, chain, context. Learned: sequence, parameters, intent, drift.</p>
          </Section>
          <Btn kind="solid" onClick={start} disabled={running || sample}><Play size={16} />{running ? "Running…" : "Run attack"}</Btn>
          {sample && <p className="text-[13px] text-muted">Needs the core.</p>}{err && <p role="alert" className="text-[15px] text-blood">{err}</p>}
        </div>
        <div className="min-w-0 space-y-4">
          <Section title={runId ? `Layers firing · ${live.length}` : "Layers firing"} hint="One bar per agent action; taller means that layer found it more suspicious." right={run && <Pill tone={run.state === "finished" ? "green" : "amber"}>{run.state}{running ? ` ${Math.round(run.progress * 100)}%` : ""}</Pill>}>
            {!runId ? <Empty title="Run an attack to watch the layers" /> : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{LAYERS.map((l) => { const dead = off.includes(l); const sc = perLayer[l] ?? []; const mx = Math.max(0, ...sc); return (
                <div key={l} className={`rounded-md border border-line p-3 ${dead ? "opacity-40" : ""}`}>
                  <div className="mb-2 flex items-baseline justify-between text-[13px] text-muted"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: LAYER_COLOR[l] }} />{LAYER_LABEL[l]}</span><span className="mono tnum text-[15px] font-medium" style={{ color: dead ? "var(--faint)" : mx > 0.5 ? LAYER_COLOR[l] : "var(--muted)" }}>{dead ? "off" : Math.round(mx * 100)}</span></div>
                  <div className="flex h-10 items-end gap-px" aria-label={`${LAYER_LABEL[l]} signal per action`}>{sc.slice(-24).map((x, i) => <i key={i} className="w-full min-w-px rounded-sm" style={{ height: `${Math.max(6, x * 100)}%`, background: x > 0.5 ? LAYER_COLOR[l] : "var(--line-2)" }} />)}</div></div>); })}</div>)}
            {live.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{live.slice(-14).map((v) => <span key={v.id} className={`mono rounded-md px-2 py-0.5 text-[13px] ${v.decision === "ALLOW" ? "bg-mossbg text-moss" : v.decision === "STEP_UP" ? "bg-amberbg text-amber" : "bg-bloodbg text-blood"}`} title={`risk ${Math.round(v.risk)}`}>{v.decision} {v.tool}</span>)}</div>}
          </Section>
          <Section title="Results" right={<div className="flex gap-2"><Btn onClick={exportJson} disabled={!rows.length}><Download size={15} />Export</Btn><Btn onClick={() => setRows([])} disabled={!rows.length}>Clear</Btn></div>}>
            {rows.length ? (<div className="overflow-x-auto"><table className="w-full text-left text-[15px]"><thead className="text-[13px] text-faint"><tr><th className="py-2 pr-3 font-normal">Run</th><th className="pr-3 font-normal">Layers off</th><th className="pr-3 font-normal">Result</th><th className="pr-3 font-normal">Caught by</th><th className="font-normal">Work done</th></tr></thead>
              <tbody className="divide-y divide-line">{rows.map((r) => (<tr key={r.n} className="align-top"><td className="py-3 pr-3"><span className="mono">{r.scenario}</span> <span className="text-muted">{r.attacker}</span></td><td className="pr-3 text-muted">{r.off.length ? r.off.map((l) => LAYER_LABEL[l]).join(", ") : "none"}</td>
                <td className="pr-3"><Pill tone={r.blocked ? "green" : "red"}>{r.blocked ? "Blocked" : "Got through"}</Pill></td><td className="pr-3">{r.carried}</td><td className="mono tnum">{r.retention == null ? "–" : `${Math.round(r.retention * 100)}%`}</td></tr>))}</tbody></table>
              <p className="mt-3 text-[15px] text-muted">{rows[rows.length - 1].take}</p></div>)
              : <Empty title="No runs yet" hint="Run once with everything on, then again with a layer off." />}
          </Section>
        </div>
      </div>
    </div>
  );
}
