// Sample data used ONLY when the core is unreachable. Every page that uses it shows a "Sample data" badge.
import type { OrbitNode } from "./types";

export const mockOrbit: OrbitNode[] = [
  { agent_id: "agt_proc_01", name: "Procurement", role: "role.procurement", position: { x: 0.2, y: 0.1, z: 0.1 }, drift: 0.2, radius: 1.2, level: 0, risk_now: 8, trail: [] },
  { agent_id: "agt_supp_01", name: "Support", role: "role.support", position: { x: -0.4, y: 0.2, z: 0.3 }, drift: 0.3, radius: 1.0, level: 0, risk_now: 5, trail: [] },
  { agent_id: "agt_fin_01", name: "Finance AP", role: "role.finance_ap", position: { x: 0.3, y: -0.2, z: -0.2 }, drift: 0.25, radius: 1.1, level: 0, risk_now: 11, trail: [] },
  { agent_id: "agt_res_01", name: "Research", role: "role.research", position: { x: -0.2, y: 0.3, z: -0.3 }, drift: 0.4, radius: 1.0, level: 0, risk_now: 14, trail: [] },
];
export const mockChains = [{ from: "agt_res_01", to: "agt_fin_01", taint: "clean", ts: 0 }];

export const mockAgent = (id: string) => ({
  id, name: "Procurement Agent", role: "role.procurement", status: "active", level: 0, session_level_max: 0, maturity: 1, sessions_seen: 212,
  risk_now: 8, open_cases: 0, scopes: ["suppliers.*", "files.*", "email.*", "http.*", "hr.*"], hosts: ["agent-runtime-01"], created_ts: 0, utility_retention: 0.96,
  twin: {
    role_contract_summary: { name: "Procurement Agent", version: 3, purpose: "Checks supplier prices and drafts purchase requests under INR 5 lakh.", tools: ["suppliers.search", "suppliers.get_price", "files.read", "purchasing.create_request", "email.send"], never_read: ["hr.confidential", "finance.confidential", "customer.pii"] },
    tool_usage: [["suppliers.search", 212], ["files.read", 198], ["suppliers.get_price", 190], ["purchasing.create_request", 141], ["email.send", 120]].map(([tool, count]) => ({ tool, count, share: (count as number) / 861 })),
    transitions: [
      { from: "suppliers.search", to: "files.read", p: 0.86, count: 182 }, { from: "files.read", to: "suppliers.get_price", p: 0.9, count: 178 },
      { from: "suppliers.get_price", to: "purchasing.create_request", p: 0.7, count: 133 }, { from: "purchasing.create_request", to: "email.send", p: 0.8, count: 113 },
      { from: "suppliers.get_price", to: "email.send", p: 0.2, count: 38 }],
    envelopes: [{ tool: "purchasing.create_request", param: "amount_inr", median: 142000, mad: 38000, min: 20000, max: 310000 }, { tool: "purchasing.create_request", param: "quantity", median: 80, mad: 30, min: 10, max: 400 }],
    volume: Array.from({ length: 40 }, (_, i) => ({ session: i + 1, steps: 5 + (i % 3), bytes_out: 420 + ((i * 37) % 160) })),
    cusum: Array.from({ length: 40 }, (_, i) => ({ session: i + 1, value: Math.max(0, Math.sin(i / 4) * 1.2 + (i > 30 ? (i - 30) * 0.5 : 0)), alarm: 4 })),
    thresholds: { sequence: 6.2, params: 3.5, intent: 0.18, cusum: 4 },
    cohort: { peer_shift: 0.04, fleet_shift: false },
    baseline: { state: "mature", n_sessions: 212 },
    decoys: [{ path: "/hr/payroll_backup_2026.xlsx", touched: false }, { path: "/finance/vendor_bank_details_FINAL.xlsx", touched: false }],
    change_windows: [],
    risk_history: Array.from({ length: 30 }, (_, i) => ({ ts: i, risk: 6 + ((i * 7) % 11) })),
    position: { x: 0.2, y: 0.1, z: 0.1, radius_ratio: 0.2 },
  },
});

export const mockContractYaml = `id: role.procurement
name: Procurement Agent
purpose: Checks supplier prices and drafts purchase requests under INR 5 lakh.
version: 3
tools:
  suppliers.search: {}
  suppliers.get_price: {}
  files.read:
    paths: ["/docs/suppliers/**"]
  purchasing.create_request:
    where:
      amount_inr: {max: 500000}
      supplier_in_catalog: {eq: true}
    step_up_over: {amount_inr: 250000}
  email.send: {}
never_read: [hr.confidential, finance.confidential, customer.pii]
egress_allowlist: [corp.example, acme-supply.example]
`;
export const mockContracts = ["procurement", "support", "finance_ap", "research"].map((r, i) => ({
  role: `role.${r}`, id: `role.${r}`, name: ["Procurement Agent", "Customer Support Agent", "Finance AP Agent", "Market Research Agent"][i], version: [3, 2, 4, 1][i], yaml: mockContractYaml, summary: "5 tools · 3 never-read classes",
}));

export const mockBench = {
  commit: "sample", seed: 0, generated_at: 0, tags: {},
  metrics: [
    { id: "abr", name: "Attack steps blocked", value: 0.97, unit: "ratio", tag: "TARGET", note: "sample value", n: 0 },
    { id: "util", name: "Utility retention", value: 0.84, unit: "ratio", tag: "TARGET", note: "sample value", n: 0 },
    { id: "fpr", name: "False alerts per 1,000 benign steps", value: 2.1, unit: "per 1k", tag: "TARGET", note: "sample value", n: 0 },
    { id: "p95", name: "Gateway p95", value: 12, unit: "ms", tag: "TARGET", note: "sample value", n: 0 },
  ],
  ablation: [{ layer_off: "none", blocked_rate: 0.97, utility: 0.84 }, { layer_off: "provenance", blocked_rate: 0.81, utility: 0.86 }, { layer_off: "sequence", blocked_rate: 0.95, utility: 0.85 }],
  cold_start: [0, 5, 10, 20, 50].map((n, i) => ({ n_sessions: n, detect_rate: [0.78, 0.82, 0.88, 0.94, 0.97][i] })),
  calibration: Array.from({ length: 10 }, (_, i) => ({ bin: i, pred: (i + 0.5) / 10, obs: Math.min(1, (i + 0.5) / 10 + (i % 2 ? 0.04 : -0.03)), n: 40 })),
  adaptive: [{ attacker: "mimicry", success_rate: 0.12, n: 50 }, { attacker: "slow_ramp", success_rate: 0.08, n: 50 }],
  latency: { p50: 4, p95: 12, p99: 21 },
};
export const mockAbout = {
  real: ["Gateway that every tool call passes through", "Role Contract compiled to Cedar and evaluated per call", "Provenance and taint ledger with argument matching", "Hidden-text detection on real PDFs", "Markov, parameter, intent and CUSUM detectors", "Risk fusion, containment ladder, Ed25519 hash-chained receipts"],
  simulated: ["The enterprise: ERP, HR share, mail and the internet are a sandbox with fake data", "Agents are puppet agents that follow instructions found in content", "Event spine is an in-process bus plus SQLite, not NATS and ClickHouse"],
  standards: ["AARM R1-R9", "OWASP Agentic Top 10 (ASI01-10)", "OTel GenAI semantic conventions", "RFC 8693 token exchange (act chain)", "SPIFFE/SPIRE", "Cedar policy language"],
};
export const mockChainGraph = {
  nodes: [{ agent_id: "agt_res_01", name: "Research", role: "role.research", taint: "tainted", level: 2, patient_zero: true }, { agent_id: "agt_fin_01", name: "Finance AP", role: "role.finance_ap", taint: "tainted", level: 1, patient_zero: false }, { agent_id: "agt_proc_01", name: "Procurement", role: "role.procurement", taint: "clean", level: 0, patient_zero: false }],
  edges: [{ from: "agt_res_01", to: "agt_fin_01", ts: 0, taint: "tainted", task: "Pay invoice PO-7781", chunks: ["chk_12"] }],
  cascade: { patient_zero: "agt_res_01", affected: ["agt_fin_01"] },
};
export const mockScenarios = [
  { id: "S1", name: "Poisoned supplier PDF", short: "Hidden instruction in a quote", challenge: "C-2", agent_id: "agt_proc_01", description: "", attacker_modes: ["static", "adaptive"], expected: "" },
  { id: "S4", name: "Slow-ramp exfiltration", short: "3 KB per session", challenge: "C-6", agent_id: "agt_proc_01", description: "", attacker_modes: ["slow_ramp"], expected: "" },
  { id: "S5", name: "Mimicry", short: "Looks like normal traffic", challenge: "C-6", agent_id: "agt_proc_01", description: "", attacker_modes: ["mimicry"], expected: "" },
  { id: "S6", name: "Chain contamination", short: "Taint rides the handoff", challenge: "C-5", agent_id: "agt_res_01", description: "", attacker_modes: ["static"], expected: "" },
];
