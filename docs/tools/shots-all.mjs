import { chromium } from "/home/arch-nitro/d3coy/tessera-lab/web/node_modules/playwright-core/index.mjs";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", args: ["--no-sandbox"] }); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const cases = await (await fetch("http://localhost:8080/cases")).json();
const pages = { fleet: "/", case: "/cases/" + cases[0].id, lab: "/lab", hijack: "/hijack", contracts: "/contracts", agent: "/agents/agt_proc_01", bench: "/bench", chains: "/chains", redteam: "/redteam" };
for (const [k, u] of Object.entries(pages)) { await p.goto("http://localhost:3000" + u); await p.waitForTimeout(2500); await p.screenshot({ path: `/home/arch-nitro/d3coy/tessera-lab/docs/phase-shots/I-${k}.png` }); }
await b.close();
