import { chromium } from "/home/arch-nitro/d3coy/tessera-lab/web/node_modules/playwright-core/index.mjs";
const B="http://localhost:3000", A="http://localhost:8080", out="/home/arch-nitro/d3coy/tessera-lab/docs/phase-shots/V3-1-";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", args: ["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const errs=[];
for (const [w,h,t] of [[1440,900,"d"],[390,844,"m"]]) {
  const p = await (await b.newContext({ viewport:{width:w,height:h} })).newPage();
  p.on("pageerror", e=>errs.push(t+" PAGEERR "+e.message.slice(0,150))); p.on("console", m=>{ if(m.type()==="error"&&!/favicon|Failed to load/.test(m.text())) errs.push(t+" CONSOLE "+m.text().slice(0,150)); });
  await fetch(A+"/reset",{method:"POST"});
  await p.goto(B+"/",{waitUntil:"networkidle"}); await p.waitForTimeout(800); await p.screenshot({path:out+"fleet-empty-"+t+".png"});
  await fetch(A+"/scenarios/S1/run",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pace:0.15})}); await p.waitForTimeout(3000); let cs=[]; for(let i=0;i<30&&!cs.length;i++){ cs=await (await fetch(A+"/cases")).json(); await p.waitForTimeout(500);} await p.waitForTimeout(2500);
  await p.screenshot({path:out+"fleet-"+t+".png"});
  await p.goto(B+"/cases",{waitUntil:"networkidle"}); await p.waitForTimeout(700); await p.screenshot({path:out+"cases-"+t+".png"});
  await p.goto(B+"/cases/"+cs[0].id,{waitUntil:"networkidle"}); await p.waitForTimeout(1500); await p.screenshot({path:out+"case-"+t+".png",fullPage:true});
  if (t==="d") { await p.goto(B+"/",{waitUntil:"networkidle"}); await p.waitForTimeout(500); const ap=p.getByRole("button",{name:/^Approve/}).first(); if(await ap.count()){ await ap.click(); await p.waitForTimeout(1200); console.log("approve ok, pending:",(await (await fetch(A+"/approvals")).json()).length);} else console.log("no approve btn"); }
  console.log(t,"h-overflow:",await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2));
}
console.log("ERRS",errs.length,errs.slice(0,6)); await b.close();
