# TESSERA Live Lab — Build Log & Explainer

*A running record of what was built, why, and how it works — written so you can read it, understand it, and explain it to your manager. Updated as phases land.*

Last updated: 25 Oct 2026 · Status: **PR0–PR10 built and running locally** (see §6 for what is verified and what is not).

---

## 1. The one-minute version

**The problem (from the hackathon).** Companies now give AI agents their own accounts and API keys. Classic security asks one question — *"is this identity allowed to do this?"* — and a hijacked agent still passes that check, because its token is valid. A hidden instruction inside a supplier PDF can make a Procurement agent read HR salary files and send them to an outside server, and every access check says "yes".

**What we built.** TESSERA is a control layer that sits between agents and the tools they call. It asks a second question: **"does this action still look like the job this agent was created to do?"** — and answers it with evidence, a 0–100 risk score, and a *proportionate* response that restricts the agent without stopping its legitimate work.

**What you can do in the Lab.** Give an agent a poisoned document, steal its token and try to misuse it, edit its contract, spawn a brand-new agent with no history, try to sneak data out slowly or by imitating normal behaviour, switch detection layers off to see which one mattered, and tamper with the audit log and watch it get caught.

**Honest framing.** The *monitor* is real. The *company* (ERP, HR files, mail, internet) and the *agents* are a sandbox with fake data. Agents are "puppets": deterministic workers that obey instructions they find in content — the standard way to test prompt injection. Every number on the Bench page is measured on this simulator, with the seed and code hash shown.

---

## 2. How it works — the concepts

### 2.1 Two lanes
Every tool call is judged twice and shown side by side:
- **Classic IAM lane** — "token valid, scope allows it" (always green on every attack: that *is* the gap).
- **TESSERA lane** — the real verdict: ALLOW / DENY / MODIFY / STEP_UP (needs a human) with a risk score.

### 2.2 The detection stack (cheapest first)
| Layer | Question it answers | How it works | Needs history? |
|---|---|---|---|
| **Contract** | Is this inside the declared role? | The Role Contract (YAML) is compiled to **Cedar** policies. `forbid` always beats `permit`; no permit = deny. | No |
| **Provenance** | *Where did this argument come from?* | Every tool output is a labelled "chunk" (trusted/untrusted). **Argument-Provenance Matching** traces each outgoing value (path, URL, recipient) back to the text that produced it. Untrusted text may supply *data*; it may not choose *where an action goes*. | No |
| **Decoys** | Did it touch bait no real job touches? | Fake payroll/bank files and a canary URL. Any touch is conclusive. | No |
| **Content** | Did it read hidden instructions? | PyMuPDF/HTML analysis finds white-on-white, tiny, off-page, CSS-hidden or commented text plus instruction-like phrases. | No |
| **Chain** | Was it handed tainted context by another agent? | Taint rides agent-to-agent handoffs; the origin is named "patient zero". | No |
| **Context** | Is the valid token being used from somewhere odd? | Host and hour checked against the agent's normal. | Light |
| **Sequence** | Is this order of tools unusual for this role? | Order-2 Markov model, trained on benign traffic only, with a role prior shrunk toward each agent's own history. | Yes |
| **Params** | Are the values unusual? | Robust envelopes (median/MAD) per tool parameter; never-seen destinations. | Yes |
| **Intent** | Does the action look like another job? | Hashed-token centroids of the role vs off-role profiles (production would use a small embedding model). | Yes |
| **Drift** | Has it been slowly changing across sessions? | CUSUM on per-email volume and session length, tool-mix PSI against a frozen reference, rolling egress budgets. | Yes |

### 2.3 From signals to a score
Signals are combined in a weighted logistic (weights visible in `core/tessera/fusion.py`) to a **0–100 risk**, then **floors** apply for evidence that is conclusive on its own (touching a decoy ≥ 85, untrusted text choosing a destination ≥ 80, a contract violation ≥ 70…). **Learned layers alone are capped below the block threshold** — a statistical oddity can raise a flag, but cannot by itself hold or deny. The **waterfall** shows each layer's contribution; the **counterfactual** panel shows the smallest change that would have made the action look normal.

### 2.4 Containment without breaking work
A ladder, applied to the *session* first and to the *agent* only when evidence accumulates:
`L0 observe → L1 step-up risky effects → L2 narrow (writes need a human, egress only to the allow-list) → L3 quarantine (read-only, outputs sanitised) → L4 decoy sandbox → L5 kill + revoke`.
In the headline scenario the injected HR read and outbound POST are blocked, the price check and email still finish, and the purchase request waits for one click — **4 of 5 task steps done, 1 awaiting approval**.

### 2.5 Legitimate change vs. attack
A **change registry** lets ops declare "new tool version / volume surge". Inside a declared window, learned-layer novelty is discounted (contract and provenance never are). The same change *undeclared* shows up as an **"unexplained shift"** case — flagged for review, not treated as an attack, no containment.

### 2.6 Cold start
A new agent starts from its role's prior. **Maturity** = sessions seen / 20. Below 50%, learned layers run in *shadow* (scored, shown, not enforced) while the day-zero layers (contract, provenance, decoys, content) enforce from step one.

### 2.7 Evidence you can trust
Every decision and containment change writes a **receipt**: JSON, hash-chained to the previous one, signed with Ed25519. The console can verify the chain, and a "tamper with row N" button shows verification failing at exactly that row.

---

## 3. Architecture (what runs where)

```
 Console (Next.js 16 · React 19 · Tailwind 4 · R3F · xyflow · visx)  :3000
        │  SSE live stream + REST
 Core (Python 3.13 · FastAPI)                                        :8080
   gateway.py   ← the one chokepoint every tool call passes through
   policy/      Role Contract → Cedar (cedarpy)        provenance/   ledger, APM, hidden-text
   twin/        Markov · envelopes · intent · CUSUM     fusion.py     risk, waterfall, counterfactuals
   contain.py   ladder + gate                           receipts.py   Ed25519 hash chain
   sim/         tools, documents (PDF/HTML), traffic, puppet agents, scenarios S1–S8
   eval.py      benchmark in a subprocess (never touches the live world)
```
Production mapping (what the deck describes): the gateway becomes a Rust data plane, the in-process bus becomes NATS JetStream, memory/JSON becomes ClickHouse + Postgres. The **schemas stay identical** (`core/tessera/models.py`), which is what makes that swap mechanical.

---

## 4. Phase-by-phase record

| Phase | What was built | Where | Proof |
|---|---|---|---|
| **PR0 Foundations + spikes** | Monorepo, frozen contracts (`contracts/API.md`, Pydantic models), console shell. **Spike S1** Cedar-in-Python: same 4 decisions as the CLI, ~0.16 ms/eval. **Spike S2** hidden text: all 6 techniques found with bbox. Spike S3 3D (frontend fork), S4 embeddings → replaced by hashed centroids (no model download, honest label). | `core/tessera/policy`, `provenance/hidden.py` | `tests/test_core.py` |
| **PR1 Sandbox world** | 14 tools in a catalog (effect, data class, trust, control vs data args), 16 documents (clean + 6 PDF + 3 HTML poisoned), decoys, IAM baseline with deliberately over-broad scopes, 4 agents, benign traffic generator | `core/tessera/sim`, `identity.py` | document detection test |
| **PR2 Gateway · Cedar · Provenance · Containment** | The PEP pipeline, contract compiler + dry-run, APM (exact/normalised/fuzzy matching; whitespace, URL-encoding, homoglyph evasions covered by tests), ladder with gate | `gateway.py`, `contain.py`, `policy/` | state-machine + APM tests |
| **PR3 Puppets · scenarios** | Hijackable agents with an instruction extractor, scenario engine S1–S8, adaptive and mimicry attackers, chains with inherited taint | `sim/puppet.py`, `sim/scenarios.py` | each scenario asserted in tests |
| **PR4 Twin + drift** | Markov with role→agent shrinkage, envelopes, intent probe, CUSUM/PSI/budgets, cold-start shadow mode, change windows | `twin/model.py` | benign replay: 0 false alerts in 1,345+ steps |
| **PR5 Fusion · evidence · receipts** | Risk fusion with floors and cap, waterfall, counterfactuals, one-sentence summaries, OWASP ASI tags, signed receipts | `fusion.py`, `receipts.py` | tamper test |
| **PR6 Case Board + two-lane console** | Live two-lane feed, case board, PDF viewer with animated thread from the hidden sentence to the action it caused, provenance graph, waterfall, receipts | `web/app/cases`, `components/case` | `docs/phase-shots/I-case.png` |
| **PR7 3D Orbit + Twin** | Agents as nodes inside translucent role shells (drift pulls them out; rings tighten with containment), 2D fallback, per-agent Twin page | `web/components/orbit`, `app/agents` | `I-fleet-3d-live.png` |
| **PR8 Interactive labs** | Attack Lab (library / write-your-own / upload, protection on/off), Hijack-it-yourself, Contract Studio (Monaco, Cedar preview, dry-run, approval for widening), Changes, Chains, Red-team with layer ablation, Stage mode | `web/app/*` | live screenshots |
| **PR9 Eval board** | Benchmark harness: benign false-alert rate, latency, attack-blocked, utility kept, leave-one-out and only-one-on ablation, cold-start curve, adaptive/mimicry success, band separation | `core/tessera/eval.py`, `/bench` | `data/benchmark.json` |
| **PR10 Harden + ship** | Fuzz tests, upload/YAML/regex limits, run caps, dependency audit (fixed a DOMPurify advisory), offline replay recorded from a real run, `justfile`, docs | `tests/test_api.py`, `justfile` | see §5 |

---

## 5. Security & quality checks performed

- **38 automated tests** (core logic, 8 scenarios, API fuzz with hostile inputs, upload and YAML limits, lone-surrogate JSON, tamper detection).
- **Static analysis** (bandit): only the expected "seeded simulation RNG" and "fixed-argument subprocess" notes remain; MD5 used for feature hashing marked non-security.
- **Dependency audit:** `pip-audit` clean; `pnpm audit` found a critical/high DOMPurify issue inside Monaco → pinned `>=3.4.17`, now clean.
- **Threat-model choices:** no real network egress (all "internet" is simulated); uploads capped (5 MB, 20 pages, type-checked) and stored under random names; YAML anchors/aliases rejected (alias bombs); contract size capped; regex inputs capped; max 6 concurrent runs and 24 agents; errors never return stack traces; CORS limited to localhost origins; the tamper endpoint is lab-only and env-gated.
- **Fail-closed:** if the policy engine errors, the call is denied.
- **Known limits** (also stated on the About page): synthetic traffic, our own attackers, sim-to-real gap unmeasured, Python gateway not Rust, intent probe is a lightweight stand-in, no LLM mode or judge built (optional in the plan).

---

## 6. Honest status

**Verified by running:** all of §4 PR0–PR5 in tests and against the live API; scenarios S1–S8; the console screens against the live core (screenshots in `docs/phase-shots/I-*.png`).
**Not done / not verified:** optional LLM agent mode and quarantined judge; Rust gateway; Prompt Guard/embedding models; real-hardware 3D frame rate (measured only with software GL); phone layout beyond navigation; hosted deployment (runs locally with `just up`).

---

## 7. Run it

```
just up          # core :8080 + console :3000
just test        # 38 tests
just eval        # regenerate the benchmark
just scenarios   # run S1–S8 headless
```
See `docs/DEMO-SCRIPT.md` for the 3-minute presenter flow and the judge hands-on card.

---

## 8. Redesign (25 Oct, v3 — current)
Feedback on v1 (tiny dark text) and v2 (purple "AI slop", walls of words). Now: **graphite + one signal**, in the spirit of Linear / Vercel / Wiz.
- shadcn/ui (Base UI) components, Geist fonts, Sonner toasts, Number Flow; two 21st.dev components power `/intro` (pixel hero + animated "how it works" bento).
- Colour only means state (green allowed, red blocked, amber needs a human, blue trusted, violet learned). White primary buttons, no gradients.
- Copy budget: title + one line per page; explanations live in "?" tooltips; per-page steps live in the **Test this page** drawer (top right); the full 14-step checklist is **Start here**.
- Verified with `docs/tools/e2e.mjs` in Chrome: all 14 pages load, guide run, approve, tamper (breaks at the exact row), stolen-token call, Attack Lab write-your-own, contract dry-run; phone width has no horizontal overflow; 0 console errors. 39 backend tests pass.
- Not verified: 3D hover/click-to-fly and real-GPU frame rate; Release/containment buttons; Lab protection-off and upload paths clicked end to end.
