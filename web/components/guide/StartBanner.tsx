"use client";
import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { GUIDE, useGuideDone } from "@/lib/guide";

/** Dismissible one-line pointer to the checklist. */
export default function StartBanner() {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem("tessera.banner") === "0"; } catch { return false; } });
  const done = useGuideDone(); const n = GUIDE.filter((g) => done[g.id]).length;
  if (hidden) return null;
  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-2.5 text-[15px]">
      <span className="flex-1 text-muted">New here? <span className="tnum text-bone">{n} of {GUIDE.length}</span> checks done.</span>
      <Link href="/guide" className="btn btn-ghost !py-1 text-[13px]">Start here</Link>
      <button aria-label="Dismiss" onClick={() => { setHidden(true); try { localStorage.setItem("tessera.banner", "0"); } catch {} }} className="rounded p-1 text-faint hover:text-bone"><X size={16} /></button>
    </div>);
}
