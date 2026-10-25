import { chromium } from "/home/arch-nitro/d3coy/tessera-lab/web/node_modules/playwright-core/index.mjs";
const out = "/home/arch-nitro/d3coy/tessera-lab/docs/phase-shots/";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", args: ["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const errs = [];
for (const [w, h, tag] of [[1440, 900, "d"], [390, 844, "m"]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on("pageerror", e => errs.push(`${tag} PAGEERR ${e.message.slice(0,160)}`));
  p.on("console", m => { if (m.type() === "error") errs.push(`${tag} CONSOLE ${m.text().slice(0,160)}`); });
  await fetch("http://localhost:8080/reset", { method: "POST" });
  const go = async (u, ms = 1800) => { await p.goto("http://localhost:3000" + u, { waitUntil: "networkidle" }).catch(()=>{}); await p.waitForTimeout(ms); };
  const shot = async (n, full = true) => p.screenshot({ path: `${out}R3-${n}-${tag}.png`, fullPage: full });
  await go("/about"); await shot("about");
  await go("/agents/agt_proc_01", 2500); await shot("agent");
  await go("/contracts", 3000);
  if (tag === "d") {
    await p.getByRole("button", { name: /Let this agent read HR files/ }).click(); await p.waitForTimeout(1200);
    await p.getByRole("button", { name: /Dry-run on recent sessions/ }).click(); await p.waitForTimeout(2500);
    await p.getByRole("button", { name: /Apply contract/ }).click(); await p.waitForTimeout(1500);
  }
  await shot("contracts");
  await go("/changes");
  if (tag === "d") { await p.getByRole("button", { name: /Run with the change declared/ }).click(); await p.waitForTimeout(500); await p.getByRole("button", { name: /Run with no declaration/ }).click(); await p.waitForTimeout(9000); }
  await shot("changes");
  await go("/chains");
  if (tag === "d") { await p.getByRole("button", { name: /Run the chain attack/ }).click(); await p.waitForTimeout(9000); }
  await shot("chains");
  await go("/redteam");
  if (tag === "d") { await p.getByRole("radio", { name: /Mimicry attacker/ }).click(); await p.getByRole("button", { name: /Run attack/ }).click(); await p.waitForTimeout(8000);
    for (const l of ["Contract", "Provenance", "Decoys", "Content"]) await p.locator("label", { hasText: l }).first().click().catch(()=>{});
    await p.getByRole("button", { name: /Run attack/ }).click(); await p.waitForTimeout(8000); }
  await shot("redteam");
  await go("/bench", 2500); await shot("bench");
  await go("/orbit-lab", 3500); await shot("orbit", false);
  await p.close();
}
await b.close(); console.log(errs.slice(0, 20).join("\n") || "no browser errors");
