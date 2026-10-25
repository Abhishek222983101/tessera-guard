import { chromium } from "/home/arch-nitro/d3coy/tessera-lab/web/node_modules/playwright-core/index.mjs";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", args: ["--no-sandbox"] });
await fetch("http://localhost:8080/reset", { method: "POST" });
const out = "/home/arch-nitro/d3coy/tessera-lab/docs/phase-shots/";
for (const [w, h, tag] of [[1440, 900, "d"], [390, 844, "m"]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.route("http://localhost:8080/**", async (route) => { const r = route.request(); if (r.url().includes("/stream")) return route.abort(); try { const resp = await route.fetch({ headers: { ...r.headers(), origin: "http://localhost:3000" } }); await route.fulfill({ response: resp, headers: { ...resp.headers(), "access-control-allow-origin": "*" } }); } catch { route.abort(); } });
  p.on("pageerror", e => console.log(tag, "PAGEERR", e.message.slice(0, 200)));
  await p.goto("http://localhost:3101/"); await p.waitForTimeout(6000);
  await p.screenshot({ path: out + `R1-fleet-empty-${tag}.png`, fullPage: true });
  await fetch("http://localhost:8080/scenarios/S1/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pace: 0.1 }) });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: out + `R1-fleet-${tag}.png`, fullPage: true });
  let cases = []; for (let i = 0; i < 30 && !cases.length; i++) { cases = await (await fetch("http://localhost:8080/cases")).json(); if (!cases.length) await new Promise(r => setTimeout(r, 1000)); }
  await p.goto("http://localhost:3101/cases"); await p.waitForTimeout(4000); await p.screenshot({ path: out + `R1-cases-${tag}.png` });
  await p.goto("http://localhost:3101/cases/" + cases[0].id); await p.waitForTimeout(6000);
  await p.screenshot({ path: out + `R1-case-${tag}.png`, fullPage: true });
}
await b.close();
