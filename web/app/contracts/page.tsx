"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/useApiB";
import { post, put, ApiError } from "@/lib/api";
import { markDone } from "@/lib/guide";
import { mockContracts } from "@/lib/mockB";
import { PageHead, Section, Btn, SampleBadge, ErrorBox, Skeleton, Empty } from "@/components/ui/bits";
import { TestGuide, Callout, Pill } from "@/components/ui/kit";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, FlaskConical, ShieldCheck, Wand2, ShieldOff, Undo2 } from "lucide-react";
import type { Monaco } from "@monaco-editor/react";
const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false, loading: () => <Skeleton h={520} /> });

interface Row { role: string; id: string; name: string; version: number; yaml: string; summary: string }
interface Validation { ok: boolean; errors: { path: string; line?: number | null; message: string }[]; cedar?: string; digest?: string }
interface DryRun { sessions_replayed: number; steps_replayed?: number; newly_blocked: { tool: string; count: number; example?: unknown }[]; newly_allowed: { tool: string; count: number; example?: unknown }[]; benign_blocked_rate: number; widening: boolean; warnings: string[] }

function beforeMount(m: Monaco) {
  m.editor.defineTheme("tessera", { base: "vs-dark", inherit: true, rules: [{ token: "type", foreground: "b4a9ff" }, { token: "string", foreground: "f5b83d" }, { token: "number", foreground: "f58a3d" }, { token: "comment", foreground: "71717a" }],
    colors: { "editor.background": "#111113", "editor.lineHighlightBackground": "#17171a", "editorLineNumber.foreground": "#52525b", "editorGutter.background": "#111113", "editorCursor.foreground": "#ffffff" } });
}

/** One-click 'what if' edits so a judge can try a risky change without writing YAML. */
const TRIES: { id: string; label: string; why: string; icon: typeof Wand2; apply: (y: string) => string }[] = [
  { id: "hr", label: "Allow HR files", why: "Removes the HR block and opens the /hr folder. The dry-run should call this out as dangerous.", icon: ShieldOff,
    apply: (y) => y.replace(/never_read: \[([^\]]*)\]/, (_m, l: string) => `never_read: [${l.split(",").map((x) => x.trim()).filter((x) => x && x !== "hr.confidential").join(", ")}]`).replace(/paths: \[([^\]]*)\]/, (_m, l: string) => `paths: [${l}, "/hr/**"]`) },
  { id: "limit", label: "Raise limit to ₹10 lakh", why: "Lets the agent create bigger purchases or payments without a stop.", icon: Wand2,
    apply: (y) => y.replace(/amount_inr: \{max: \d+\}/g, "amount_inr: {max: 1000000}") },
  { id: "domain", label: "Allow a new email domain", why: "Adds newpartner.example to the places this agent may send data.", icon: Wand2,
    apply: (y) => y.replace(/egress_allowlist: \[/, "egress_allowlist: [newpartner.example, ") },
];

export default function Contracts() {
  const { data: rows, loading, error, sample, reload } = useApi<Row[]>("/contracts", mockContracts as Row[]);
  const [role, setRole] = useState<string>(""); const [text, setText] = useState(""); const [saved, setSaved] = useState("");
  const [val, setVal] = useState<Validation | null>(null); const [dry, setDry] = useState<DryRun | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null); const [ask, setAsk] = useState(false); const [approver, setApprover] = useState("");
  const [tab, setTab] = useState<"check" | "policy">("check");
  const editorRef = useRef<{ getModel: () => unknown } | null>(null); const monacoRef = useRef<Monaco | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (rows.length && !role) { setRole(rows[0].role); setText(rows[0].yaml); setSaved(rows[0].yaml); } }, [rows, role]);
  const pick = (r: Row) => { setRole(r.role); setText(r.yaml); setSaved(r.yaml); setVal(null); setDry(null); setMsg(null); setAsk(false); };

  useEffect(() => {
    if (!role || sample) return; const t = setTimeout(async () => {
      try { setVal(await post<Validation>("/contracts/validate", { yaml: text })); } catch (e) { setVal({ ok: false, errors: [{ path: "", message: e instanceof ApiError ? e.message : "Validation failed" }] }); }
    }, 400); return () => clearTimeout(t);
  }, [text, role, sample]);
  useEffect(() => {
    const m = monacoRef.current; const ed = editorRef.current as unknown as { getModel: () => Parameters<Monaco["editor"]["setModelMarkers"]>[0] | null } | null; if (!m || !ed?.getModel()) return;
    m.editor.setModelMarkers(ed.getModel()!, "tessera", (val?.errors ?? []).filter((e) => e.line).map((e) => ({ severity: m.MarkerSeverity.Error, message: e.message, startLineNumber: e.line!, endLineNumber: e.line!, startColumn: 1, endColumn: 200 })));
  }, [val]);

  const dirty = text !== saved;
  const dryRun = useCallback(async () => { setBusy("dry"); setMsg(null); try { setDry(await post<DryRun>(`/contracts/${role}/dryrun`, { yaml: text })); markDone("contract"); } catch (e) { setMsg(e instanceof ApiError ? e.message : "The dry-run failed"); } finally { setBusy(null); } }, [role, text]);
  async function apply(withApprover?: string) {
    setBusy("apply"); setMsg(null);
    try { await put(`/contracts/${role}`, { yaml: text, approver: withApprover || undefined }); setSaved(text); setAsk(false); toast.success("Contract applied", { description: "Recompiled and signed into the audit trail." }); reload(); }
    catch (e) { if (e instanceof ApiError && e.status === 409) setAsk(true); else setMsg(e instanceof ApiError ? e.message : "Couldn't apply the contract"); } finally { setBusy(null); }
  }
  if (loading && !rows.length) return <Skeleton h={500} />;
  const cur = rows.find((r) => r.role === role);
  return (
    <div>
      <PageHead title="Role contracts" sub="The job description each agent is held to." right={sample ? <SampleBadge /> : undefined} />
      <TestGuide id="contracts" steps={["Pick Procurement on the left.", "Press “Allow HR files”, then “Dry-run”.", "Read the amber and red rows.", "Press Apply. It asks for an approver."]}
        expect="The dry-run lists risky things that become allowed (HR files) and any normal work that would break. Widening changes need a second person's name." />
      {error && <div className="mb-4"><ErrorBox message={error} onRetry={reload} /></div>}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[200px_minmax(0,1fr)_380px]">
        <nav aria-label="Roles" className="flex gap-2 overflow-x-auto xl:flex-col">
          {rows.map((r) => (<button key={r.role} onClick={() => pick(r)} aria-current={r.role === role} className={`shrink-0 rounded-lg border px-3 py-2.5 text-left transition-colors ${r.role === role ? "border-line2 bg-panel2" : "border-transparent hover:bg-panel"}`}>
            <div className="text-[15px] font-medium text-bone">{r.name.replace(" Agent", "")}</div><div className="mono text-[13px] text-faint">v{r.version}</div></button>))}
        </nav>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] text-faint">Try a change</span>
            {TRIES.map((t) => (<button key={t.id} title={t.why} onClick={() => { setText((x) => t.apply(x)); setDry(null); setMsg(null); }} className="btn btn-ghost !px-3 !py-1.5 text-[13px]"><t.icon size={14} />{t.label}</button>))}
            <button onClick={() => setText(saved)} disabled={!dirty} className="btn btn-ghost !px-3 !py-1.5 text-[13px] text-muted"><Undo2 size={14} />Undo</button></div>
          <div className="overflow-hidden rounded-lg border border-line"><Editor height="520px" defaultLanguage="yaml" language="yaml" value={text} theme="tessera" beforeMount={beforeMount}
            onMount={(ed, m) => { editorRef.current = ed as never; monacoRef.current = m; }} onChange={(v) => setText(v ?? "")}
            options={{ minimap: { enabled: false }, fontSize: 14, lineHeight: 22, fontFamily: "Geist Mono, monospace", scrollBeyondLastLine: false, padding: { top: 12 }, renderLineHighlight: "line", tabSize: 2, ariaLabel: "Role contract YAML" }} /></div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn onClick={dryRun} disabled={!role || !!busy || sample || !val?.ok}><FlaskConical size={16} />{busy === "dry" ? "Replaying…" : "Dry-run"}</Btn>
            <Btn kind="solid" onClick={() => apply()} disabled={!dirty || !!busy || sample || !val?.ok}><ShieldCheck size={16} />{busy === "apply" ? "Applying…" : "Apply"}</Btn>
            {dirty && <Pill tone="amber">Unsaved</Pill>}{sample && <span className="text-[13px] text-muted">Needs the core.</span>}
          </div>
          {msg && <Callout tone="warn">{msg}</Callout>}
        </div>
        <div className="space-y-4">
          <Section title={tab === "check" ? "Checks" : "Compiled policy"} hint={tab === "check" ? "Your YAML is validated as you type." : "What is actually enforced (Cedar)."} right={<div className="flex gap-0.5 rounded-md bg-panel2 p-0.5 text-[13px]">{(["check", "policy"] as const).map((k) => <button key={k} onClick={() => setTab(k)} className={`rounded px-2.5 py-1 font-medium ${tab === k ? "bg-panel3 text-bone" : "text-muted"}`}>{k === "check" ? "Check" : "Policy"}</button>)}</div>}>
            {tab === "check" ? (!val ? <p className="text-[15px] text-muted">{sample ? "Offline." : "Checking…"}</p> : val.ok ? <p className="flex items-center gap-2 text-[15px] text-moss"><CheckCircle2 size={16} />Valid{val.digest ? <span className="mono text-[13px] text-faint">{val.digest}</span> : ""}</p>
              : <ul className="space-y-2">{val.errors.map((e, i) => (<li key={i} className="flex gap-2 rounded-md bg-amberbg p-2.5 text-[15px]"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber" /><span><span className="mono text-[13px] text-muted">{e.path}{e.line ? ` · line ${e.line}` : ""}</span><br />{e.message}</span></li>))}</ul>)
              : <pre className="mono max-h-[360px] overflow-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">{val?.cedar ?? "Appears once the contract is valid."}</pre>}
          </Section>
          <Section title="Dry-run" hint="Replays hundreds of normal sessions under your edited contract.">
            {!dry ? <Empty title="Not run yet" /> : (
              <div className="space-y-4 text-[15px]">
                <div className="flex items-center justify-between"><span className="text-muted">Normal work that breaks</span><b className="mono tnum">{(dry.benign_blocked_rate * 100).toFixed(1)}%</b></div>
                {dry.widening && <Callout tone="danger" title="Widens access.">Needs a second approver.</Callout>}
                <DiffList title="Newly allowed" empty="Nothing new." items={dry.newly_allowed} tone="amber" />
                <DiffList title="Would stop" empty="Nothing breaks." items={dry.newly_blocked} tone="red" />
                {dry.warnings.map((w, i) => <p key={i} className="text-[13px] text-muted">{w}</p>)}
              </div>)}
          </Section>
          {cur && <p className="text-[13px] text-faint">{cur.name} · v{cur.version}</p>}
        </div>
      </div>
      <Dialog open={ask} onOpenChange={setAsk}><DialogContent className="border-line bg-panel text-bone">
        <DialogHeader><DialogTitle>Second approver needed</DialogTitle><DialogDescription className="text-muted">This change widens what the agent may do.</DialogDescription></DialogHeader>
        <input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Approver's name" aria-label="Approver name" className="w-full rounded-md border border-line2 bg-panel2 px-3 py-2 text-[15px] outline-none focus:border-ice" autoFocus />
        <DialogFooter><button className="btn btn-ghost" onClick={() => setAsk(false)}>Cancel</button><button className="btn btn-primary" disabled={!approver.trim() || busy === "apply"} onClick={() => apply(approver.trim())}>Approve and apply</button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
function DiffList({ title, items, tone, empty }: { title: string; items: { tool: string; count: number; example?: unknown }[]; tone: "amber" | "red"; empty: string }) {
  const c = tone === "amber" ? "bg-amberbg" : "bg-bloodbg";
  return (<div><div className="mb-1.5 text-[13px] text-faint">{title}</div>{items.length ? <ul className="space-y-1.5">{items.map((i) => <li key={i.tool} className={`rounded-md p-2.5 ${c}`}><div className="mono text-[13px] font-medium">{i.tool}{i.count > 1 ? ` × ${i.count}` : ""}</div>{i.example != null && <div className="mono mt-0.5 truncate text-[13px] text-muted">{typeof i.example === "string" ? i.example : JSON.stringify(i.example)}</div>}</li>)}</ul> : <div className="rounded-md bg-mossbg p-2.5 text-[13px] text-moss">{empty}</div>}</div>);
}
