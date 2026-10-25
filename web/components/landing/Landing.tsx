/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, ListChecks, Play, FlaskConical, BarChart3, ShieldCheck } from "lucide-react";
import { PixelCanvas } from "@/components/ui/pixel-perfect-hero";
import InkOrbitFeatures from "@/components/ui/ink-orbit-features";
import { Logo } from "@/components/Logo";
import ParadigmFooter from "@/components/ParadigmFooter";
import IsoRelay from "@/components/landing/IsoRelay";
import { post, get } from "@/lib/api";

const STANDARDS = ["OWASP Agentic Top 10", "Cedar policy", "AARM decisions", "RFC 8693 delegation", "SPIFFE identity", "OpenTelemetry GenAI", "Ed25519 receipts"];
interface Bench { metrics: { id: string; value: number; unit: string }[] }


export default function Landing() {
  const r = useRouter();
  const [colors, setColors] = useState<string[]>([]);
  const [bench, setBench] = useState<Bench | null>(null);
  useEffect(() => {
    const d = document.createElement("div"); document.body.appendChild(d); d.className = "text-muted-foreground"; const m = getComputedStyle(d).color; d.className = "text-primary"; const p = getComputedStyle(d).color; document.body.removeChild(d);
    setColors([m, m, m, m, p]);
    get<Bench>("/bench").then(setBench).catch(() => {});
  }, []);
  const val = (id: string) => bench?.metrics.find((m) => m.id === id)?.value;
  async function runAttack() { try { await post("/scenarios/S1/run", { pace: 0.3 }); } catch {} r.push("/demo"); }
  const stats = [["False alerts per 1,000 steps", val("false_alerts_per_1000"), ""], ["Attacker steps stopped", val("attack_blocked_rate"), "%"], ["Real work kept", val("utility_retention"), "%"]] as const;
  return (
    <div className="min-h-screen bg-background text-bone">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-5">
          <Logo />
          <nav className="hidden items-center gap-7 text-[15px] text-muted md:flex">
            <a href="#how" className="transition-colors hover:text-bone">How it works</a>
            <a href="#try" className="transition-colors hover:text-bone">Try it</a>
            <a href="#standards" className="transition-colors hover:text-bone">Standards</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/guide" className="btn btn-ghost hidden !py-1.5 sm:inline-flex"><ListChecks size={15} />Start here</Link>
            <Link href="/fleet" className="btn btn-primary !py-1.5">Open the lab<ArrowRight size={15} /></Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">{colors.length > 0 && <PixelCanvas colors={colors} gap={7} speed={25} />}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_0%,var(--background)_75%)]" /></div>
        <div className="mx-auto grid max-w-[1240px] items-center gap-6 px-5 pb-16 pt-14 lg:grid-cols-[1fr_1.15fr] lg:pb-24 lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line2 bg-panel/70 px-3 py-1 text-[13px] text-muted"><ShieldCheck size={14} />D3COY 1.0 · Identity drift in AI agents</span>
            <h1 className="mt-6 text-[44px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[60px]">
              <span className="font-serif italic font-medium text-muted">Valid token.</span><br />Wrong behaviour.
            </h1>
            <p className="mt-5 max-w-[34rem] text-[18px] leading-relaxed text-muted">Catch AI agents that drift from their role while their credentials still work, and contain them without stopping the real work.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={runAttack} className="btn btn-primary !h-12 !px-6 text-[15px]"><Play size={16} fill="currentColor" />Run the attack</button>
              <Link href="/guide" className="btn btn-ghost !h-12 !px-6 text-[15px]"><ListChecks size={16} />Take the guided tour</Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
              {stats.map(([l, v, u]) => (<div key={l}><dt className="text-[13px] text-faint">{l}</dt><dd className="mt-1 text-[26px] font-semibold tnum">{v === undefined ? "–" : Math.round(v as number)}<span className="text-[15px] text-muted">{u}</span></dd></div>))}
            </dl>
          </div>
          <div className="relative"><div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_55%,rgba(255,255,255,.07),transparent_65%)]" /><IsoRelay /></div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-[1240px] scroll-mt-20 px-5 py-8"><InkOrbitFeatures theme="dark" brand="Tessera" /></section>

      <section id="try" className="mx-auto max-w-[1240px] scroll-mt-20 px-5 py-20">
        <h2 className="text-[32px] font-semibold tracking-tight">Try it in three clicks</h2>
        <p className="mt-2 text-[16px] text-muted">No setup. Nothing real is touched.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { n: "1", t: "Watch an attack get caught", d: "A hidden line in a supplier PDF hijacks an agent. Its token stays valid.", icon: Play, cta: "Run the attack", act: runAttack },
            { n: "2", t: "Attack it yourself", d: "Write your own poisoned document or use a stolen token.", icon: FlaskConical, cta: "Open Attack Lab", act: () => r.push("/lab") },
            { n: "3", t: "Check the proof", d: "Measured results, signed receipts, and where we lose.", icon: BarChart3, cta: "See the results", act: () => r.push("/bench") },
          ].map(({ n, t, d, icon: I, cta, act }) => (
            <button key={n} onClick={act} className="card group flex flex-col items-start gap-4 p-6 text-left transition-colors hover:border-line2 hover:bg-panel2">
              <span className="flex w-full items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-full border border-line2 text-[15px] tnum text-muted">{n}</span><I size={18} className="text-faint" /></span>
              <span className="text-[19px] font-semibold">{t}</span><span className="text-[15px] leading-relaxed text-muted">{d}</span>
              <span className="mt-auto inline-flex items-center gap-1.5 text-[15px] font-medium">{cta}<ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></span>
            </button>))}
        </div>
      </section>

      <section id="standards" className="scroll-mt-20 border-y border-line py-10">
        <div className="mx-auto max-w-[1240px] px-5">
          <p className="mb-5 text-center text-[13px] uppercase tracking-[0.14em] text-faint">Built on open standards</p>
          <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_12%,white_88%,transparent)]">
            <style>{`@keyframes lm{from{transform:translateX(0)}to{transform:translateX(-50%)}}.lm{animation:lm 36s linear infinite}@media (prefers-reduced-motion:reduce){.lm{animation:none}}`}</style>
            <div className="lm flex w-max gap-14 text-[15px] text-muted">{[0, 1].map((k) => (<div key={k} className="flex gap-14" aria-hidden={k === 1}>{STANDARDS.map((s) => <span key={s + k} className="whitespace-nowrap font-medium">{s}</span>)}</div>))}</div>
          </div>
        </div>
      </section>

      <ParadigmFooter />
    </div>
  );
}
