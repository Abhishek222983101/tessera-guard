"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { connect, useStore, resetLocal } from "@/lib/store";
import { post } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { GUIDE, useGuideDone } from "@/lib/guide";
import { guideForPath } from "@/lib/pageGuides";
import { GuideCtxProvider, usePageGuide } from "@/components/ui/kit";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Activity, FlaskConical, KeyRound, ScrollText, FileCode2, GitBranch, Link2, Swords, BarChart3, Play, Info, RotateCcw, ListChecks, CircleHelp, Check, Home, ArrowRight, Bot } from "lucide-react";

const GROUPS: { label: string; items: { href: string; label: string; icon: typeof Activity }[] }[] = [
  { label: "", items: [{ href: "/", label: "Home", icon: Home }, { href: "/guide", label: "Start here", icon: ListChecks }, { href: "/demo", label: "Live demo", icon: Play }] },
  { label: "Monitor", items: [{ href: "/fleet", label: "Fleet", icon: Activity }, { href: "/agents", label: "Agents", icon: Bot }, { href: "/cases", label: "Cases", icon: ScrollText }, { href: "/chains", label: "Agent chains", icon: Link2 }] },
  { label: "Attack", items: [{ href: "/lab", label: "Attack Lab", icon: FlaskConical }, { href: "/hijack", label: "Stolen token", icon: KeyRound }, { href: "/redteam", label: "Red-team", icon: Swords }] },
  { label: "Control", items: [{ href: "/contracts", label: "Role contracts", icon: FileCode2 }, { href: "/changes", label: "Declared changes", icon: GitBranch }] },
  { label: "Evidence", items: [{ href: "/bench", label: "Results", icon: BarChart3 }, { href: "/about", label: "What's real", icon: Info }] },
];
const FLAT = GROUPS.flatMap((g) => g.items);
const TOUR = [{ href: "/demo", label: "Live demo" }, { href: "/fleet", label: "Fleet" }, { href: "/agents", label: "Agents" }, { href: "/cases", label: "Cases" }, { href: "/lab", label: "Attack Lab" }, { href: "/hijack", label: "Stolen token" },
  { href: "/redteam", label: "Red-team" }, { href: "/chains", label: "Agent chains" }, { href: "/contracts", label: "Role contracts" }, { href: "/changes", label: "Declared changes" }, { href: "/bench", label: "Results" }];
const CONN: Record<string, { c: string; t: string }> = {
  live: { c: "var(--moss)", t: "Connected" }, connecting: { c: "var(--amber)", t: "Connecting" }, polling: { c: "var(--amber)", t: "Reconnecting" },
  replay: { c: "var(--ice)", t: "Recorded replay" }, offline: { c: "var(--blood)", t: "Core offline" },
};

function Inner({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const conn = useStore((s) => s.conn);
  const done = useGuideDone();
  const registered = usePageGuide(); const guide = guideForPath(path) ?? registered;
  const [open, setOpen] = useState(false);
  const n = GUIDE.filter((g) => done[g.id]).length;
  useEffect(() => { connect(); }, []);
  async function doReset() { try { await post("/reset"); } catch {} resetLocal(); }
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.shiftKey && e.key.toLowerCase() === "r" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable)) doReset(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  const c = CONN[conn];
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const ti = TOUR.findIndex((t) => path === t.href || (t.href !== "/" && path.startsWith(t.href + "/")));
  const next = ti >= 0 ? TOUR[(ti + 1) % TOUR.length] : null;
  if (path === "/") return <>{children}</>;
  return (
    <div className="flex min-h-screen">
      <aside className="sidebar-in sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-ink md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto px-3" aria-label="Main">
          {GROUPS.map((g, gi) => (
            <div key={gi} className="mb-5">
              {g.label && <div className="px-2 pb-1 pt-1 text-[13px] font-medium uppercase tracking-[0.1em] text-faint">{g.label}</div>}
              {g.items.map(({ href, label, icon: I }) => {
                const on = isOn(href);
                return (
                  <Link key={href} href={href} aria-current={on ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors ${on ? "bg-panel2 text-bone" : "text-muted hover:bg-panel hover:text-bone"}`}>
                    <I size={17} strokeWidth={1.75} className={on ? "text-bone" : "text-faint"} />{label}
                    {href === "/guide" && <span className="ml-auto text-[13px] tnum text-faint">{n}/{GUIDE.length}</span>}
                  </Link>);
              })}
            </div>))}
        </nav>
        <div className="border-t border-line p-3">
          <button onClick={doReset} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[15px] text-muted transition-colors hover:bg-panel hover:text-bone" title="Reset the lab (Shift+R)">
            <RotateCcw size={16} /> Reset lab <kbd className="mono ml-auto text-[11px] text-faint">⇧R</kbd></button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-ink/85 px-5 backdrop-blur md:px-10">
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto md:hidden" aria-label="Main (mobile)">
            {FLAT.map(({ href, label }) => <Link key={href} href={href} aria-current={isOn(href) ? "page" : undefined} className={`shrink-0 rounded-md px-2.5 py-1.5 text-[13px] ${isOn(href) ? "bg-panel2 text-bone" : "text-muted"}`}>{label}</Link>)}
          </nav>
          {next && <Link href={next.href} className="mx-3 hidden min-w-0 items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-line2 hover:text-bone md:flex"><span className="tnum text-faint">Tour {ti + 1}/{TOUR.length}</span><span className="text-bone">Next: {next.label}</span><ArrowRight size={14} /></Link>}
          <div className="hidden items-center gap-2 text-[13px] text-muted md:flex"><span className="h-2 w-2 rounded-full" style={{ background: c.c, animation: conn === "live" ? "pulse-dot 2.4s infinite" : undefined }} />{c.t}</div>
          <button onClick={() => setOpen(true)} className="btn btn-ghost shrink-0 whitespace-nowrap !py-1.5 text-[13px]"><CircleHelp size={15} /><span className="hidden sm:inline">Test this page</span><span className="sm:hidden">Test</span></button>
        </div>
        {conn === "offline" && <div role="alert" className="border-b border-blood/30 bg-bloodbg px-6 py-2.5 text-[15px] text-blood">Core offline. Start it with <span className="mono">just up</span>, or open <Link className="underline" href="/demo">Live demo</Link> for the recorded replay.</div>}
        <div className="mx-auto w-full max-w-[1400px] px-5 py-8 md:px-10">{children}</div>
      </main>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[420px] max-w-[92vw] overflow-y-auto border-line bg-panel p-0 text-bone">
          <SheetHeader className="border-b border-line p-5"><SheetTitle className="text-[17px] text-bone">Test this page</SheetTitle><SheetDescription className="text-[15px] text-muted">Steps to try, and what you should see.</SheetDescription></SheetHeader>
          <div className="space-y-6 p-5">
            {guide ? (<>
              {"goal" in guide && guide.goal && <div><div className="mb-1 text-[12px] font-medium uppercase tracking-wider text-faint">Goal</div><p className="text-[15px] text-bone/90">{guide.goal}</p></div>}
              <div><div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-faint">Do this</div>
                <ol className="space-y-3">{guide.steps.map((s, i) => (<li key={i} className="flex gap-3 text-[15px]"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-panel3 text-[12px] font-medium text-muted">{i + 1}</span><span className="text-bone/90">{s.replace(/^Step \d+:\s*/i, "")}</span></li>))}</ol></div>
              <div className="rounded-lg border border-moss/30 bg-mossbg p-3.5"><div className="mb-1 flex items-center gap-1.5 text-[13px] font-medium text-moss"><Check size={14} /> You should see</div><p className="text-[14px] leading-relaxed text-bone/90">{guide.expect}</p></div>
              {"watch" in guide && guide.watch?.length > 0 && <div className="rounded-lg border border-amber/30 bg-amberbg p-3.5"><div className="mb-1.5 text-[13px] font-medium text-amber">Bugs to look for</div><ul className="list-disc space-y-1 pl-5 text-[14px] text-bone/90">{guide.watch.map((w) => <li key={w}>{w}</li>)}</ul></div>}
            </>) : <p className="text-[14px] text-muted">No steps for this page. Use the full checklist.</p>}
            <Link href="/guide" onClick={() => setOpen(false)} className="btn btn-ghost w-full">Open the full checklist ({n}/{GUIDE.length})</Link>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return <TooltipProvider delay={120}><GuideCtxProvider><Inner>{children}</Inner></GuideCtxProvider></TooltipProvider>;
}
