// Builds docs/TESTING-GUIDE.md from the in-app page guides (web/lib/pageGuides.ts) + the narrative sections below, then docs/TESTING-GUIDE.pdf via headless Chrome.
import { PAGE_GUIDES } from "../../web/lib/pageGuides.ts";
import fs from "node:fs";
const URL = "https://tessera-guard.vercel.app";
const order = [["guide", "Start here", "/guide", "Your checklist. It ticks itself as you test."], ["stage", "Live demo", "/demo", "Run a scenario and watch it end to end, with a pop-up summary."], ["fleet", "Fleet", "/fleet", "Control room: every agent, every action, what needs a human."], ["agents", "Agents", "/agents", "The four protected agents, plus create a new one with no history."], ["agent", "Agent page", "/agents/agt_proc_01", "What one agent normally does and whether it is drifting."], ["cases", "Cases", "/cases", "List of alerts."], ["case", "Case page", "/cases/<id>", "Full evidence for one alert."], ["lab", "Attack Lab", "/lab", "Give an agent a document you choose."], ["hijack", "Stolen token", "/hijack", "Misuse a valid token yourself."], ["redteam", "Red-team", "/redteam", "Smart attackers and layer switches."], ["contracts", "Role contracts", "/contracts", "Edit the declared job; dry-run; approvals."], ["changes", "Declared changes", "/changes", "Real change vs unexplained change."], ["chains", "Agent chains", "/chains", "How infection moves between agents."], ["bench", "Results", "/bench", "Measured numbers and limits."], ["about", "What's real", "/about", "Real vs simulated."]];
let pages = "";
for (const [id, name, path, blurb] of order) { const g = PAGE_GUIDES[id]; if (!g) continue;
  pages += `\n### ${name}  \`${path}\`\n*${blurb}*\n\n**Goal:** ${g.goal}\n\n**Do this**\n\n${g.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n**You should see:** ${g.expect}\n\n**Bugs to look for**\n\n${g.watch.map((w) => `- [ ] ${w}`).join("\n")}\n`; }
const md = `# TESSERA: Team testing guide

**Team Paradigm · D3COY 1.0 · Problem: Identity Drift Detection in Autonomous AI Agents**
Live site: **${URL}** · Code: https://github.com/Abhishek222983101/tessera-guard

This guide tells you what the project is, what every item in the sidebar does, and exactly what to click on every page, what you should see, and what bugs to hunt for. Please test every page and report anything that differs.

---

## 1. What this project is about (60 seconds)

**The problem.** Companies now give AI agents their own accounts, tokens and permissions. Normal security asks one question, *"is this identity allowed to do this?"*. A hidden instruction in a PDF, a poisoned tool or a stolen token can make an agent read HR salary files and send them to a stranger **while its token stays 100% valid**, so every access check says yes.

**Our idea.** TESSERA adds a second question on every action: *"does this still look like the job this agent was created to do?"* It learns normal behaviour, compares it with the agent's declared role, and when they diverge it **explains the alert with a 0-100 risk score, shows the evidence, and contains the agent without stopping its real work**.

**How it works (short).** Every tool call from every agent passes through one gateway. The gateway checks, in order: the classic token check (what today's tools see) → *where each value came from* (untrusted document text may supply data but may not choose where an action goes) → the **Role Contract** (the agent's job description, compiled to Cedar policy) → decoy files and hidden-text detection → tainted handoffs and unfamiliar hosts → the **learned behaviour** of that agent (tool order, parameter ranges, intent, slow drift) → a fused risk score. The decision is ALLOW, DENY, or STEP_UP (a human must approve). Containment narrows what the agent may do (a ladder, L0-L5) instead of switching it off. Every decision becomes a signed, hash-chained receipt.

**What is real and what is simulated.** The monitor is real (gateway, Cedar policy, provenance tracking, hidden-text detection on real PDFs, learned models, risk fusion, containment, signed receipts). The *company* it protects (ERP, HR files, mail, "the internet") and the *agents* are a sandbox with fake data. The agents are deterministic "puppets" that obey instructions they read, the standard way to test prompt injection.

**Headline results (measured on the simulator).** 0 false alerts per 1,000 normal steps · 90% of attacker steps blocked or flagged · 80% of real work still completes during an attack (the rest waits for one click) · decisions in about 3 ms · with only classic IAM, data leaves in 100% of runs. We also show where we lose: a mimicry attacker fools the *learned* layers alone, and the deterministic layers (contract, provenance) are what stop it.

---

## 2. The sidebar, item by item

| Sidebar item | What it is for |
|---|---|
| **Home** | The landing page: the idea in one animated isometric machine (an agent sends a quote and a poisoned PDF through the gateway: the quote reaches ERP, the poisoned one is blocked), live headline numbers, how it works, and the team footer. |
| **Start here** | A 14-step checklist for judges and testers. It ticks itself off as you use the lab. |
| **Live demo** | Pick one of 8 scenarios, press Run, watch the agent get attacked and caught, read a pop-up summary. Includes Replay (a saved run that needs no backend). |
| **Fleet** | Control room. Live actions with two columns: *Access check* (today's security) vs *TESSERA*. Approve held actions. 3D/2D map of agents inside their allowed-behaviour bubbles. |
| **Agents** | The four protected agents (Procurement, Support, Finance AP, Research) plus create-a-new-agent (no history). Each agent page has a working-hours clock, learned behaviour and drift charts. |
| **Cases** | Every alert. A case page shows the source of the attack, step timeline, why the score is what it is, the containment ladder, a data-flow map and signed receipts you can tamper with. |
| **Agent chains** | Isometric map of the fleet. Shows how a poisoned agent infects another through a handoff; names patient zero; freeze the cascade. |
| **Attack Lab** | You choose the agent and the document (library, text you write, or a PDF you upload; the Upload tab has one-click sample files if you have none). Switch Protection off to see what happens without TESSERA. |
| **Stolen token** | You play the attacker holding a valid token. The page shows what today's access check says vs what TESSERA says. |
| **Red-team** | Smart attackers (mimicry, slow leak, stolen token) and switches to turn each detection layer off, so you see which layer actually stopped the attack. |
| **Role contracts** | The agent's declared job as editable text. See the compiled Cedar policy, dry-run a change against past sessions, approvals needed to widen access. |
| **Declared changes** | Real change (a new tool, a busy period) must not raise false alarms; unexplained change is flagged but not treated as an attack. |
| **Results** | Measured numbers: false alerts, attacks blocked, work kept, speed, ablation, cold-start curve, adaptive attackers, and the limits. |
| **What's real** | Real vs simulated, and the standards the design follows. |
| **Top bar: Tour n/11** | A button that takes you to the next page in a sensible order. |
| **Top bar: Test this page** | A drawer with the goal, steps, expected result and bugs-to-look-for for the page you are on (the same text as section 4 below). |
| **Reset lab (Shift+R)** | Resets the whole lab to a clean state. Use it before each test. |

---

## 3. Before you start

1. Open **${URL}** in Chrome or Firefox (desktop). A phone works too.
2. Click **Open the lab**. The sidebar should slide in.
3. Press **Shift+R** (or *Reset lab* at the bottom of the sidebar) before each section so you start clean.
4. The lab keeps its state in one server instance. If numbers ever vanish, the server restarted: press Shift+R and run again, and tell us when it happened.
5. When you find a bug, use the template in section 7.

---

## 4. Page by page: what to click, what you should see
${pages}

---

## 5. Eight scenarios (Live demo or Red-team)

| ID | What happens | Expected |
|---|---|---|
| S1 | The problem-statement example: a hidden line in a supplier PDF | HR read and POST blocked; 4 of 5 real steps done; 1 awaiting approval |
| S2 | A trusted tool quietly changes its description | That tool is quarantined; payments continue |
| S3 | A stolen valid token used from a strange host at 03:10 | High risk from the first call; HR/finance reads denied |
| S4 | A leak that grows 40 bytes per session | Held at about session 13 of 30; never held with drift switched off |
| S5 | An attacker copies normal behaviour first | Blocked by contract + provenance; succeeds if those are switched off |
| S6 | A poisoned agent hands work to another | Research = patient zero; Finance's payment blocked |
| S7 | A real, declared change | No alert; undeclared change gives a shift case, not an attack |
| S8 | A brand-new agent with no history | Caught on day zero; learned layers in shadow |

---

## 6. Cross-cutting checks (do these on every page)

- [ ] Nothing scrolls sideways at phone width (about 390 px).
- [ ] Every button does something; none leave you on a spinner.
- [ ] **Test this page** (top right) opens a drawer with steps for this page.
- [ ] Browser console has no red errors (F12).
- [ ] **Shift+R** resets the lab from any page.
- [ ] With the backend unreachable (turn Wi-Fi off), Live demo -> **Replay** still plays a saved run.
- [ ] Text is readable; no overlapping elements; the 3D/isometric views draw.

## 7. Bug report template

\`\`\`
Page / URL:
What I did (steps):
What I expected:
What happened:
Screenshot or console error:
Browser / device:
Time (the lab can restart) :
\`\`\`

## 8. Known limitations (not bugs)

- The company and the agents are simulated; benign traffic is synthetic.
- On the hosted site the lab state is in memory: it can reset if the server restarts or scales out under heavy parallel use.
- Learned detection alone can flag but not block (by design); mimicry beats learned layers on their own.
- Not built yet: Rust gateway, NATS/ClickHouse spine, embedding-based intent, LLM judge, real agent frameworks, SPIFFE binding (see Future scope in the README).
`;
fs.writeFileSync("docs/TESTING-GUIDE.md", md);
console.log("md written", md.length);
