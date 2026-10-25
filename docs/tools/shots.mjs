import { chromium } from "playwright-core";
const base = process.argv[2], out = process.argv[3], pages = process.argv.slice(4);
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", args: ["--no-sandbox"] });
for (const [w,h,tag] of [[1920,1080,"d"],[390,844,"m"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
  let cur=""; p.on("pageerror", e => console.log(cur, w, "PAGEERR", e.message.slice(0,200)));
  p.on("console", m => { if (m.type()==="error") console.log(cur, w, "CONSOLE", m.text().slice(0,200)); });
  for (const pg of pages) { const [name, path] = pg.split("="); cur=name; await p.goto(base+path, { waitUntil: "networkidle" }).catch(()=>{}); await p.waitForTimeout(3500); await p.screenshot({ path: `${out}/A-${name}-${tag}.png`, fullPage: tag==="d" && name==="case" }); }
  await ctx.close();
}
await b.close();
