"use client";
import { useSyncExternalStore } from "react";
import { API, api } from "./api";
import type { Verdict, Case, StreamEvent } from "./types";

export interface Approval { id: string; status: "pending"|"approved"|"rejected"; verdict_id: string; agent_id: string; tool: string; args: Record<string, unknown>; risk: number }
export interface ContainmentEvt { agent_id: string; session_id?: string; from: number; to: number; reason: string; scope: string; receipt_id?: string; ts: number }
export interface RunState { run_id: string; scenario?: string; state: string; progress: number; utility?: unknown; outcome?: Record<string, unknown> }
export interface State {
  conn: "connecting" | "live" | "polling" | "replay" | "offline";
  verdicts: Verdict[]; cases: Record<string, Case>; approvals: Record<string, Approval>; containment: ContainmentEvt[];
  runs: Record<string, RunState>; seq: number; resetCount: number; lastEventTs: number;
}
const MAX = 4000;
const INITIAL: State = { conn: "connecting", verdicts: [], cases: {}, approvals: {}, containment: [], runs: {}, seq: 0, resetCount: 0, lastEventTs: 0 };
let state: State = INITIAL;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const set = (p: Partial<State>) => { state = { ...state, ...p }; emit(); };

export function apply(ev: StreamEvent, seq?: number) {
  const s = state; const patch: Partial<State> = { lastEventTs: Date.now() };
  if (seq !== undefined) patch.seq = Math.max(s.seq, seq);
  switch (ev.type) {
    case "verdict": { if (s.verdicts.some((v) => v.id === ev.data.id)) break; const v = [...s.verdicts, ev.data]; patch.verdicts = v.length > MAX ? v.slice(-MAX) : v; break; }
    case "case": patch.cases = { ...s.cases, [ev.data.id]: ev.data }; break;
    case "approval": patch.approvals = { ...s.approvals, [ev.data.id]: ev.data }; break;
    case "containment": patch.containment = [...s.containment, { ...ev.data, ts: Date.now() / 1000 }].slice(-500); break;
    case "run": patch.runs = { ...s.runs, [ev.data.run_id]: { ...s.runs[ev.data.run_id], ...ev.data } }; break;
    case "reset": Object.assign(patch, { verdicts: [], cases: {}, approvals: {}, containment: [], runs: {}, resetCount: s.resetCount + 1 }); break;
  }
  state = { ...s, ...patch }; emit();
}

let es: EventSource | null = null; let poll: ReturnType<typeof setInterval> | null = null; let started = false;
// serverless runs finish inside one request, so their events arrive together; replay them a beat apart so the feed still feels live
let pollSeq = 0;
let dripping = false; const dripQ: { type: StreamEvent["type"]; data: unknown; seq: number }[] = [];
function drip(evs: { type: StreamEvent["type"]; data: unknown; seq: number }[]) {
  if (evs.length <= 1) { for (const e of evs) apply({ type: e.type, data: e.data } as StreamEvent, e.seq); return; }
  dripQ.push(...evs); if (dripping) return; dripping = true;
  const step = () => { const e = dripQ.shift(); if (!e) { dripping = false; return; } apply({ type: e.type, data: e.data } as StreamEvent, e.seq); setTimeout(step, e.type === "verdict" ? 320 : 40); };
  step();
}
export function connect() {
  if (started || typeof window === "undefined") return; started = true;
  // hydrate recent history first so the console is never empty when you open it mid-run
  api<{ events: { type: StreamEvent["type"]; data: unknown; seq: number }[]; last_seq: number }>("/events?since=0&limit=2000").then((j) => {
    if (j?.events) { for (const e of j.events) apply({ type: e.type, data: e.data } as StreamEvent, e.seq); pollSeq = j.last_seq ?? state.seq; }
  }).catch(() => {}).finally(() => open());
  const open = () => {
    if (process.env.NEXT_PUBLIC_MOCK === "1") { set({ conn: "replay" }); import("./mock").then((m) => m.runFixture(6)); return; }
    if (process.env.NEXT_PUBLIC_POLL === "1") { set({ conn: "live" }); startPoll(); return; }   // serverless: no long-lived streams, short polls keep one warm instance
    es = new EventSource(`${API}/stream?since=${state.seq}`);
    es.onopen = () => { if (poll) { clearInterval(poll); poll = null; } set({ conn: "live" }); };
    const types = ["verdict", "case", "session", "containment", "approval", "run", "change", "reset", "heartbeat"] as const;
    for (const t of types) es.addEventListener(t, (m) => { try { const d = JSON.parse((m as MessageEvent).data); apply({ type: t, data: d.data ?? d } as StreamEvent, d.seq); } catch {} });
    es.onerror = () => { es?.close(); set({ conn: "polling" }); startPoll(); setTimeout(open, 3000); };
  };
  const startPoll = () => { if (poll) return; poll = setInterval(async () => {
    try { const j = await api<{ events: { type: StreamEvent["type"]; data: unknown; seq: number }[]; last_seq: number }>(`/events?since=${pollSeq}&limit=500`);
      if (typeof j.last_seq === "number" && j.last_seq < pollSeq) { resetLocal(); state = { ...state, seq: 0 }; pollSeq = 0; return; }   // the server instance restarted: drop phantom rows
      if (j.events.length) pollSeq = j.events[j.events.length - 1].seq; drip(j.events); if (process.env.NEXT_PUBLIC_POLL === "1") set({ conn: "live" }); else if (j.events.length) set({ conn: "polling" }); } catch { set({ conn: "offline" }); } }, process.env.NEXT_PUBLIC_POLL === "1" ? 1800 : 2000); };
}
/** Offline/fallback: feed a recorded NDJSON of stream events at `speed`x. */
export async function replay(events: { type: StreamEvent["type"]; data: unknown; dt?: number }[], speed = 1) {
  set({ conn: "replay" });
  for (const e of events) { await new Promise((r) => setTimeout(r, Math.min(800, (e.dt ?? 400) / speed))); apply({ type: e.type, data: e.data } as StreamEvent); }
}
export const resetLocal = () => apply({ type: "reset", data: {} } as StreamEvent);
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => sel(state), () => sel(INITIAL));
}
export const getState = () => state;
