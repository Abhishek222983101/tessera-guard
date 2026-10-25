// Mirrors core/tessera/models.py + contracts/API.md. Keep in sync.
export type Decision = "ALLOW" | "DENY" | "MODIFY" | "STEP_UP" | "DEFER";
export type Band = "normal" | "elevated" | "high" | "critical";
export type Trust = "trusted" | "mixed" | "untrusted";
export const LAYERS = ["contract","provenance","decoy","content","chain","context","sequence","params","intent","drift"] as const;
export type Layer = (typeof LAYERS)[number];

export interface Evidence { text: string; ref?: string | null; bbox?: number[] | null; page?: number | null; doc?: string | null }
export interface Signal { layer: string; score: number; flags: string[]; evidence: Evidence[]; shadow: boolean; latency_ms: number }
export interface ArgOrigin { origin: "user"|"trusted_tool"|"untrusted_chunk"|"model_unknown"|"mixed"; source_id?: string|null; source_label?: string|null; trust: Trust; control: boolean; match?: string|null }
export interface WaterfallStep { layer: string; delta: number; cumulative: number }
export interface Counterfactual { label: string; risk_after: number; band_after?: Band; changes?: string[] }
export interface Verdict {
  id: string; event_id: string; ts: number; session_id: string; step: number; agent_id: string; role: string; tool: string; effect: string;
  args: Record<string, unknown>; arg_origins: Record<string, ArgOrigin>;
  decision: Decision; reason_code: string; risk: number; band: Band; signals: Signal[]; waterfall: WaterfallStep[];
  floor?: { name: string; value: number } | null; session_risk: number; containment_level: number; summary: string;
  iam: { valid: boolean; scope_ok: boolean; reason: string; label: string };
  cedar: { decision: string; policies: string[] }; safe_alternative?: string | null; approval_id?: string | null;
  case_id?: string | null; receipt_id?: string | null; latency_ms: number; executed: boolean; output_chunk?: string | null;
  via: "agent" | "stolen_token" | "lab"; counterfactual: Counterfactual[]; kind: "attack" | "unexplained_shift" | "benign";
  output?: string;
}
export interface Case {
  id: string; agent_id: string; role: string; session_id: string; opened_ts: number; updated_ts: number;
  status: "open"|"contained"|"resolved"; severity: Band; max_risk: number; title: string; summary: string; owasp: string[];
  kind: string; verdict_ids: string[]; containment_level: number; patient_zero?: string|null;
  root_cause?: { doc?: string; chunk?: string; text?: string; bbox?: number[]; page?: number; step?: number } | null;
  utility: Record<string, unknown>;
}
export interface Receipt { id: string; idx: number; prev_hash: string; payload_hash: string; ts: number; kind: string; payload: Record<string, unknown>; signer: string; sig: string }
export interface ChangeEvent { id: string; role: string; kind: string; tool?: string|null; description: string; start_ts: number; end_ts: number; declared_by: string }
export interface Agent {
  id: string; name: string; role: string; status: "active"|"contained"|"killed"; level: number; session_level_max: number; maturity: number;
  sessions_seen: number; risk_now: number; open_cases: number; scopes: string[]; hosts: string[]; created_ts: number; utility_retention: number | null;
}
export interface ToolSpec { name: string; description: string; effect: string; data_class: string; output_trust: string; control_args: string[]; data_args: string[]; fields: {name:string;type:string;example:unknown;control:boolean}[]; pinned_hash: string }
export interface DocSummary {
  id: string; path: string; title: string; kind: "pdf"|"html"|"text"; origin: string; poisoned: boolean; technique: string; blurb: string; pages: number; uploaded?: boolean;
  analysis: { hidden_text: boolean; hidden: {kind:string;text:string;page:number;bbox:number[];detail:string}[]; injection_score: number; injection_hits: {pattern:string;text:string;weight:number}[]; pages: number } | null;
}
export interface Scenario { id: string; name: string; short: string; challenge: string; agent_id: string; description: string; attacker_modes: string[]; expected: string }
export interface Utility { legit_total: number; legit_done: number; legit_pending_approval: number; legit_blocked: number; retention: number }
export interface OrbitNode { agent_id: string; name: string; role: string; position: {x:number;y:number;z:number}; drift: number; radius: number; level: number; risk_now: number; trail: {x:number;y:number;z:number}[] }
export type StreamEvent =
  | { type: "verdict"; data: Verdict } | { type: "case"; data: Case }
  | { type: "session"; data: { session_id: string; agent_id: string; task: string; state: "started"|"ended"; utility?: Utility } }
  | { type: "containment"; data: { agent_id: string; session_id?: string; from: number; to: number; reason: string; scope: "session"|"agent"; receipt_id?: string } }
  | { type: "approval"; data: { id: string; status: "pending"|"approved"|"rejected"; verdict_id: string; agent_id: string; tool: string; args: Record<string,unknown>; risk: number } }
  | { type: "run"; data: { run_id: string; scenario?: string; state: "started"|"progress"|"finished"; progress: number; utility?: Utility; outcome?: Record<string, unknown> } }
  | { type: "change"; data: ChangeEvent } | { type: "reset"; data: Record<string, never> } | { type: "heartbeat"; data: Record<string, never> };
