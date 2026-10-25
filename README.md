<div align="center">

# TESSERA
### Behaviour-aware control plane for AI agents — catch identity drift while credentials are still valid

**An agent's token can be perfectly valid while a hidden instruction in a PDF makes it read the HR salary file and post it to a stranger. TESSERA is the layer that notices, explains it, and contains it without stopping the agent's real work.**

[![Live Demo](https://img.shields.io/badge/LIVE_DEMO-tessera--guard.vercel.app-2ea44f?style=for-the-badge)](https://tessera-guard.vercel.app)

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-core-009688?logo=fastapi&logoColor=white)
![Cedar](https://img.shields.io/badge/Cedar-policy-8A2BE2)
![Next.js](https://img.shields.io/badge/Next.js_16-React_19-000000?logo=next.js)
![Tests](https://img.shields.io/badge/tests-39%2F39_passing-brightgreen)
![License](https://img.shields.io/badge/license-Apache_2.0-informational)

**Team Paradigm · D3COY 1.0 (DJS ISACA, DJSCE Mumbai) · Problem: *Identity Drift Detection in Autonomous AI Agents***

</div>

---

## At a glance

| | |
|---|---|
| **Problem statement** | Identity Drift Detection in Autonomous AI Agents (D3COY 1.0) |
| **Live demo** | **https://tessera-guard.vercel.app** ← open this first, nothing to install |
| **Repo** | https://github.com/Abhishek222983101/tessera-guard |
| **Step-by-step judge test plan** | [`docs/TEST-PLAN.md`](docs/TEST-PLAN.md) (also built into the site: **Start here** + a **Test this page** button on every page) |
| **Tests** | 39 backend tests + a browser end-to-end run (`docs/tools/e2e.mjs`) |
| **Measured results** | the **Results** page in the app, or [`core/static/benchmark.json`](core/static/benchmark.json) |

---

## The problem, in one example

> *A Procurement Agent normally checks supplier prices and creates purchase requests. After reading a supplier's PDF with a hidden instruction, it starts reading HR salary files and sending data to an unknown external server. **Its token and permissions are still valid, so normal security tools raise no alarm.*** — the problem statement

Classic access control asks **"is this identity allowed to do this?"** and answers yes on every step of this attack. TESSERA asks a second question on every action: **"does this still look like the job this agent was created to do?"** — and answers with evidence, a 0–100 risk score, and a proportionate response.

<details>
<summary><b>The official problem statement, condensed</b></summary>

Build a system that **learns the normal behaviour** of AI agents, **continuously compares it with each agent's declared role**, and **detects when behaviour no longer matches that role even though credentials are still valid**. It must **explain every alert with a clear risk score**, and **restrict or isolate the agent without disrupting legitimate work**.

Core challenges: valid credentials hide the attack · indirect prompt injection · legitimate change vs adversarial drift · little or no history · chains of agents · evasion (mimicry, slow change).
</details>

---

## Every requirement, and where to see it working

| # | The problem statement asks for | What we built | See it live |
|---|---|---|---|
| R-01 | **Learn normal behaviour** | A behavioural twin per agent, learned from benign traffic only: tool-order Markov model, parameter ranges, an intent probe, CUSUM drift. Hierarchical: role prior shrunk toward each agent's own history. | **Agents →** any agent: tool-order graph, usage and ranges, drift chart, **Working-hours clock** |
| R-02 | **Compare with the declared role** | The **Role Contract** is data (YAML) compiled to **Cedar** policies; `forbid` always beats `permit`. | **Role contracts**: edit, see the compiled Cedar, **Dry-run** against 300 past sessions |
| R-03 | **Detect drift while credentials are valid** | A two-lane view of every action: *what today's access check says* vs *what TESSERA says*. The left lane is green on every attack. | **Live demo** or **Fleet**: run S1 |
| R-04 | **Explain every alert with a risk score** | 0–100 score, a per-layer breakdown, the source sentence highlighted on the PDF with a line to the action it caused, a counter-factual ("what would make this OK"). | **Cases →** open a case |
| R-06/07 | **Restrict or isolate without disrupting legitimate work** | A containment ladder L0–L5 that narrows capabilities per session first; held steps wait for one-click human approval. | **Cases**: ladder + "4 of 5 steps finished · 1 waiting for you" |
| C-1 | Valid credentials hide the attack | The gateway checks provenance and role, not just scope. | **Stolen token**: an allowed token, a blocked action |
| C-2 | **Indirect prompt injection** | Hidden-text detection on PDFs/HTML (white-on-white, tiny, off-page, CSS-hidden, comments) + **argument-provenance matching**: untrusted text may supply data, it may not choose *where an action goes*. | **Attack Lab**: write your own hidden instruction |
| C-3 | Legitimate change vs adversarial drift | A **change registry**: declared changes discount learned-layer novelty (never the contract or provenance); an undeclared change becomes an *unexplained shift* case — flagged, not contained. | **Declared changes**: run S7 declared vs undeclared |
| C-4 | Little or no history | Day-zero layers (contract, provenance, decoys, content) enforce from step one; learned layers run in *shadow* until the agent has 10 of 20 sessions. | **Agents →** *New agent, no history*, then run S8 |
| C-5 | Chains of agents | Taint rides handoffs; the first tricked agent is named **patient zero**; **Freeze cascade** quarantines the infected path. | **Agent chains** (isometric fleet map) |
| C-6 | Evasion (mimicry, slow change) | Mimicry is stopped by provenance + contract even when behaviour looks normal; slow leaks by CUSUM, tool-mix PSI and rolling egress budgets. Results include where we lose. | **Red-team**: S4, S5, with layer switches |

---

## Screenshots (captured from the live deployment)

| | |
|---|---|
| ![Landing](docs/screenshots/01-landing.png) **Landing**: the isometric machine loops by itself | ![Fleet](docs/screenshots/02-fleet.png) **Fleet**: two-lane feed, approvals, agents |
| ![Case](docs/screenshots/03-case.png) **Case**: the hidden sentence on the PDF, the action it caused, why, proof | ![Chains](docs/screenshots/09-chains.png) **Agent chains**: patient zero and the tainted handoff |
| ![Agent](docs/screenshots/06-agent.png) **Agent**: working-hours clock, learned behaviour | ![Results](docs/screenshots/08-bench.png) **Results**: every number tagged MEASURED |

## Try it in 2 minutes

**https://tessera-guard.vercel.app** — then follow the numbered route (the site also guides you: sidebar → **Start here**).

1. **Landing page** — watch the isometric machine loop: a quote goes through the gateway to ERP (`200`), a poisoned PDF is blocked (`1 blocked`).
2. **Open the lab → Live demo → S1** — the left column ("Access check") stays green on every row; the right column ("TESSERA") goes red on the HR read and the outbound POST. The gauge climbs to ~99, the ladder moves to L2, and the progress bar says **4 of 5 steps finished · 1 waiting for you**.
3. **Fleet → Approve** — release the held purchase request. It runs.
4. **Cases → the S1 case** — hover the red box on the PDF: a line shows the action it caused. Open **Why** and **What would make this OK**. **Receipts → Tamper → Verify**: verification fails at exactly that row.
5. **Attack Lab** — run with **Protection off** and see *Data left the building*. Then **Write** your own hidden instruction and watch it get caught.
6. **Stolen token → Stay under the radar** — allowed, but flagged high (valid token, unfamiliar host, 03:00).
7. **Red-team** — S5 mimicry; switch the deterministic layers off to see which layer was doing the work. S4 slow leak: held at about session 13 of 30.
8. **Declared changes** (no false alarm for real change), **Agent chains** (taint and patient zero), **Role contracts** (edit, Dry-run, approval to widen), **Results**.

The full, page-by-page script with what you should see at every step: **[`docs/TEST-PLAN.md`](docs/TEST-PLAN.md)**. For teammates: **[`docs/TESTING-GUIDE.pdf`](docs/TESTING-GUIDE.pdf)** (also [`.md`](docs/TESTING-GUIDE.md)) explains the idea, what every sidebar item does, and gives click-by-click steps, expected results and bugs-to-look-for for every page. Inside the app, the **Test this page** button (top right) shows the same steps for the page you are on.

<details>
<summary><b>Prove it is a real backend, not a mock-up</b></summary>

```bash
curl https://tessera-guard.vercel.app/server/health            # Cedar engine answering
curl https://tessera-guard.vercel.app/server/tools             # the tool catalogue (effect, data class, control args)
curl -X POST https://tessera-guard.vercel.app/server/scenarios/S1/run -H 'content-type: application/json' -d '{"pace":0}'
curl https://tessera-guard.vercel.app/server/cases             # the case S1 just opened
curl https://tessera-guard.vercel.app/server/receipts/verify   # signed, hash-chained receipts
```
The API contract is in [`contracts/API.md`](contracts/API.md).
</details>

---

### Deployment verification

The deployed site was driven end to end in a real browser by [`docs/tools/live-ui-test.mjs`](docs/tools/live-ui-test.mjs): landing page and isometric machine → Start here → run S1 → demo shows *Blocked* and *4 of 5 steps* → Fleet *Attack stopped* → **Approve** the held action → open the case → hidden text and score breakdown → **tamper a receipt and detect it** → Attack Lab (poisoned quote stopped) → Stolen token (access check allowed, TESSERA blocks) → Agent chains (patient zero named) → Role contracts (Cedar compiles) → Results (MEASURED tags) → Agent page (working-hours clock).
**15 / 15 checks pass, 0 page errors** (`B=https://tessera-guard.vercel.app node docs/tools/live-ui-test.mjs`). Backend: 39/39 tests (`just test`).

## What is happening inside

```
Agents (puppet workers in the sandbox company)
        │  every tool call
        ▼
 ┌────────────────────────── TESSERA gateway (one chokepoint) ──────────────────────────┐
 │ 1 Classic IAM     token valid? scope ok?                    ← what today's tools see │
 │ 2 Provenance      where did each argument come from?       (argument-provenance match)│
 │ 3 Role Contract   Cedar policy, deny-overrides              ← the declared role      │
 │ 4 Decoys/content  bait files touched? hidden instructions?                            │
 │ 5 Chain/context   tainted handoff? valid token on a new host/hour?                    │
 │ 6 Learned twin    tool order · parameter ranges · intent · drift (CUSUM/PSI/budgets)   │
 │ 7 Fusion          0–100 risk, per-layer waterfall, floors, counterfactuals             │
 │ 8 Decision        ALLOW · DENY · MODIFY · STEP_UP (needs a human)                      │
 │ 9 Containment     ladder L0–L5, per-session first                                      │
 │10 Receipt         Ed25519-signed, hash-chained evidence                                │
 └───────────────────────────────────────────────────────────────────────────────────────┘
        │ live events                                                │ tool executes (or is held)
        ▼                                                            ▼
 Console (Next.js)                                   Simulated company: ERP, HR/finance files, mail, "internet"
```

**The decisive design choices**
- **Untrusted text can supply data, but it cannot steer an action.** Every argument is traced back to its source. A recipient, URL or path that came from document text is a control-argument violation, whatever the agent "meant".
- **Learned signals can flag, but never block on their own.** A statistical oddity can ask for a human; only deterministic evidence (contract, provenance, decoy) can deny. This is why the false-alert rate is 0 on benign traffic.
- **Contain by narrowing, not by stopping.** The ladder removes capabilities (writes, egress) per session, so legitimate reads and emails still finish.
- **Every number on the site is measured.** Anything not measured is tagged TARGET or left out.

### What is real and what is simulated

| Real | Simulated |
|---|---|
| The gateway; Cedar policy engine (`cedarpy`); contract compiler and dry-run | The company: ERP, HR/finance share, mail and the "internet" are a sandbox with fake data and decoys |
| Provenance ledger and argument matching; hidden-text detection on real PDFs/HTML (PyMuPDF) | The agents: deterministic *puppet* agents that obey instructions they read (the standard way to test prompt injection) |
| Behavioural twin (Markov, envelopes, intent probe, CUSUM/PSI), fusion, containment ladder | Benign traffic and attackers are generated by us (synthetic; sim-to-real gap not measured) |
| Signed, hash-chained receipts (Ed25519); live event stream; approvals | Event spine is in-process, not NATS; storage is in memory, not ClickHouse/Postgres |

---

## Results (measured on the simulator; reproduce with `just eval`)

| Measure | Result |
|---|---|
| False alerts on normal traffic | **0 per 1,000 steps** (n = 4,136) |
| Attacker steps blocked or flagged high | **90 %** (n = 36) |
| Legitimate task steps completed during an attack | **80 %** (the remaining step waits for one-click approval) |
| Gateway decision latency | p50 1.9 ms · p95 3.1 ms · p99 3.8 ms (Python reference gateway, incl. Cedar) |
| Data leaves with only classic IAM on | **100 %** of runs (the problem is real) |
| Slow leak (40 B/session growth) held at | **session 13 of 30**; **never** with the drift layer off |
| Cold start | learned-only detection 0 % → 100 % by 10 sessions of history; day-zero layers catch it from step one |
| Adaptive attacker (retries after a block) | succeeds 0 of 10 |
| Mimicry attacker | succeeds 0 of 10 with all layers; **10 of 10 when only learned layers are on** — shown on purpose |

**Where we lose, stated plainly:** learned layers alone cannot stop a mimicry attacker (they are capped so they can flag but not block); the intent probe is a hashed-token stand-in for a real embedding model; traffic is synthetic. See *Future scope* and `docs/SYSTEM-ARCHITECTURE.md` §4.6.

---

## What we built (all phases)

| Phase | Delivered |
|---|---|
| PR0 Foundations | Monorepo, frozen API contract, console shell, Cedar-in-Python spike (same decisions as the Cedar CLI, ~0.2 ms/eval), hidden-text spike |
| PR1 Sandbox | 14 tools with effect/data class/control args, 16 documents (clean + 6 poisoned PDFs + 3 HTML), decoys, IAM baseline with deliberately over-broad scopes, 4 agents, traffic generator |
| PR2 Gateway | Policy enforcement point, Role Contract → Cedar, provenance ledger and argument matching, containment ladder, graceful denial |
| PR3 Scenarios | Hijackable puppet agents, scenarios **S1–S8**, adaptive and mimicry attackers, agent chains with inherited taint |
| PR4 Learning | Markov twin with role→agent shrinkage, envelopes, intent probe, CUSUM/PSI/budgets, cold start, change windows |
| PR5 Evidence | Fusion + floors + learned-only cap, waterfall, counterfactuals, signed receipts |
| PR6–PR8 Console | Fleet, Case Board with PDF thread, Attack Lab, Stolen-token lab, Role-contract studio, Declared changes, Chains, Red-team with layer ablation, Live demo |
| PR9 Evaluation | Benchmark harness: false alerts, latency, blocked, utility, ablation, cold-start curve, adaptive attackers |
| PR10 Hardening | API fuzzing, upload/YAML/regex limits, dependency audit, recorded replay fallback, deployment |

Full build record: [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) · design plan: [`docs/PROTOTYPE-BUILD-PLAN.md`](docs/PROTOTYPE-BUILD-PLAN.md) · production design: [`docs/SYSTEM-ARCHITECTURE.md`](docs/SYSTEM-ARCHITECTURE.md).

## What we did **not** build (honest list)

- The production data plane (Rust gateway, NATS JetStream spine, ClickHouse/Postgres). The prototype keeps the same schemas so the swap is mechanical.
- Learned models beyond the Markov/envelope/CUSUM family: the small causal Transformer, embedding-based intent (bge-small), Prompt Guard classifier, the explainable-boosting fusion with conformal alert budgets.
- The optional LLM mode for agents and the quarantined LLM judge.
- Real agent frameworks (LangGraph / OpenAI Agents SDK) and an MCP proxy in front of real tool servers.
- Real identity binding (SPIFFE/SPIRE, RFC 8693 token exchange); the prototype models the handoff chain and host binding.
- Hosted multi-user persistence: on Vercel the lab state lives in a warm serverless instance and resets if the platform recycles it or scales out under heavy parallel load; the console detects that and clears itself. Press **Shift+R** (or *Reset lab*) any time, and run `just up` locally for a fully stateful session.

## Future scope

1. **Production data plane:** Rust gateway as a sidecar/MCP proxy, NATS JetStream spine, ClickHouse for events, Postgres for contracts.
2. **Stronger learning:** small causal Transformer (ONNX) for sequences, embedding-based intent probe, an explainable boosting fusion with conformal alert budgets, federated priors across tenants.
3. **Real identity:** SPIFFE-bound tokens, RFC 8693 delegation chains, CAEP/SSF revoke signals on containment.
4. **Real agents:** LangGraph / OpenAI Agents SDK adapters, MCP proxy with tool-description pinning, OpenTelemetry GenAI ingestion for agents we do not proxy.
5. **Operations:** Slack/Teams approvals, SOC playbooks (n8n), per-tenant contracts with two-person approval, adaptive red-team in CI.

---

## Tech stack

`Python 3.13` · `FastAPI` · `Cedar (cedarpy)` · `PyMuPDF` · `PyNaCl (Ed25519)` · `NumPy` · `RapidFuzz` · `Next.js 16 / React 19` · `Tailwind 4` · `shadcn/ui (Base UI)` · `react-isokit` (isometric figures) · `React Flow` · `React Three Fiber` · `Monaco` · deployed on **Vercel** (Next.js + Python FastAPI as two services, one URL).

Standards the design lines up with: OWASP Top 10 for Agentic Applications (ASI tags on cases), AARM decisions (ALLOW / DENY / MODIFY / STEP_UP / DEFER), Cedar, RFC 8693 delegation, SPIFFE, OpenTelemetry GenAI.

## Repository layout

```
core/                 Python core (FastAPI)
  tessera/gateway.py        the single chokepoint (pipeline above)
  tessera/policy/           Role Contract → Cedar
  tessera/provenance/       ledger, argument matching, hidden-text detection
  tessera/twin/             learned behaviour (Markov, envelopes, intent, drift)
  tessera/fusion.py         risk score, waterfall, counterfactuals
  tessera/contain.py        containment ladder
  tessera/receipts.py       signed hash-chained receipts
  tessera/sim/              tools, documents, traffic, puppet agents, scenarios S1–S8
  tessera/eval.py           benchmark harness  →  static/benchmark.json
  tests/                    39 tests
web/                  Next.js console (landing, guide, demo, fleet, cases, lab, …)
contracts/API.md      the frozen API contract
docs/                 TEST-PLAN, BUILD-LOG, architecture, build plan, diagrams, screenshots
vercel.json           two services (web + api) behind one URL
```

## Run it yourself

```bash
just up          # console http://localhost:3000, core http://localhost:8080  (needs uv, node 22, pnpm, just)
just test        # 39 backend tests
just eval        # regenerate the benchmark
just scenarios   # run S1–S8 headless
```
No API keys. Everything runs offline.

## Security notes

The sandbox never touches the network: all "internet" and company systems are simulated. Uploads are size/type checked (5 MB, 20 pages) and stored under random names; YAML anchors/aliases are rejected; regex inputs are bounded; concurrent runs and agent counts are capped; errors never return stack traces; the policy engine fails closed. `pip-audit` and `pnpm audit` are clean.

## Contributors

**[Abhishek Tiwari](https://github.com/Abhishek222983101)** — Team Paradigm

## License

Apache 2.0 — see [`LICENSE`](LICENSE).
