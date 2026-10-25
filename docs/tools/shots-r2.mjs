import { chromium } from "/home/arch-nitro/d3coy/tessera-lab/web/node_modules/playwright-core/index.mjs";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", args: ["--no-sandbox"] });
const out = "/home/arch-nitro/d3coy/tessera-lab/docs/phase-shots/";
const errs = [];
for (const [w, h, tag] of [[1440, 900, "d"], [390, 844, "m"]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on("pageerror", (e) => errs.push(tag + " PAGEERR " + e.message.slice(0, 150)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(tag + " CONSOLE " + m.text().slice(0, 150)); });
  await fetch("http://localhost:8080/reset", { method: "POST" });
  await p.goto("http://localhost:3000/guide"); await p.waitForTimeout(1500);
  await p.screenshot({ path: out + `R2-guide-${tag}.png`, fullPage: tag === "d" });
  if (tag === "d") {
    await p.getByRole("button", { name: /Run the attack for me/ }).click(); await p.waitForTimeout(500);
    await p.goto("http://localhost:3000/demo"); await p.waitForTimeout(9000);
    await p.screenshot({ path: out + "R2-demo-d.png", fullPage: true });
    await p.goto("http://localhost:3000/lab"); await p.waitForTimeout(1500);
    await p.getByRole("button", { name: /ACME Q4 quote \(page 3 poisoned\)/ }).click();
    await p.getByRole("button", { name: /Run the agent/ }).click(); await p.waitForTimeout(9000);
    await p.screenshot({ path: out + "R2-lab-d.png", fullPage: true });
    await p.goto("http://localhost:3000/hijack"); await p.waitForTimeout(1200);
    await p.getByRole("button", { name: /Read the HR salary file/ }).click(); await p.getByRole("button", { name: /Send as the agent/ }).click(); await p.waitForTimeout(1500);
    await p.getByRole("button", { name: /Stay under the radar/ }).click(); await p.getByRole("button", { name: /Send as the agent/ }).click(); await p.waitForTimeout(1500);
    await p.screenshot({ path: out + "R2-hijack-d.png", fullPage: true });
  } else {
    for (const u of ["lab", "hijack", "demo"]) { await p.goto("http://localhost:3000/" + u); await p.waitForTimeout(1500); await p.screenshot({ path: out + `R2-${u}-m.png` }); }
  }
}
console.log(errs.join("\n") || "no browser errors"); await b.close();
