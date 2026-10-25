import { chromium } from "/home/arch-nitro/d3coy/tessera-lab/web/node_modules/playwright-core/index.mjs";
const B = process.env.B || "https://tessera-guard.vercel.app", A = B + "/server", out = "/home/arch-nitro/d3coy/tessera-lab/docs/screenshots/";
const J = { "content-type": "application/json" };
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0, 160))); p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errs.push(m.text().slice(0, 160)); });
await fetch(A + "/reset", { method: "POST" });
await p.goto(B + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(5200); await p.screenshot({ path: out + "01-landing.png" });
await fetch(A + "/scenarios/S1/run", { method: "POST", headers: J, body: JSON.stringify({ pace: 0 }) });
const cs = await (await fetch(A + "/cases")).json(); console.log("cases", cs.length);
const shots = { "02-fleet": "/fleet", "03-case": "/cases/" + cs[0].id, "04-demo": "/demo", "05-guide": "/guide", "06-agent": "/agents/agt_proc_01", "07-contracts": "/contracts", "08-bench": "/bench" };
for (const [n, u] of Object.entries(shots)) { await p.goto(B + u, { waitUntil: "networkidle" }); await p.waitForTimeout(2500); await p.screenshot({ path: out + n + ".png", fullPage: n === "03-case" }); }
await fetch(A + "/scenarios/S6/run", { method: "POST", headers: J, body: JSON.stringify({ pace: 0 }) });
await p.goto(B + "/chains", { waitUntil: "networkidle" }); await p.waitForTimeout(2500); await p.screenshot({ path: out + "09-chains.png" });
console.log("errors", errs); await b.close();
