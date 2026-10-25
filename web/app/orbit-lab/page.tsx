"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { mockChains, mockOrbit } from "@/lib/mockB";
import type { OrbitNode } from "@/lib/types";
import { PageHead, Btn } from "@/components/ui/bits";
const OrbitScene = dynamic(() => import("@/components/orbit/OrbitScene"), { ssr: false, loading: () => <div className="h-[560px] animate-pulse rounded-lg bg-panel2" /> });

/** Dev route: a scripted S1-like drift so the Orbit can be seen without the backend. */
export default function OrbitLab() {
  const [t, setT] = useState(0); const [mode, setMode] = useState<"3d" | "2d">("3d"); const [lvl, setLvl] = useState(0); const [sel, setSel] = useState<string>();
  useEffect(() => { const i = setInterval(() => setT((x) => x + 1), 400); return () => clearInterval(i); }, []);
  const phase = Math.min(1, (t % 60) / 40);   // 0..1 over 16 s then reset
  const orbit: OrbitNode[] = mockOrbit.map((o, i) => i === 0
    ? { ...o, drift: 0.3 + phase * 1.5, risk_now: Math.round(8 + phase * 90), level: lvl, position: { x: 0.8, y: 0.4, z: -0.3 } }
    : { ...o, drift: o.drift + Math.sin((t + i * 7) / 6) * 0.08 });
  return (
    <div>
      <PageHead title="Orbit lab" sub="Scripted drift demo." right={<>
        {[0, 1, 2, 3, 4, 5].map((l) => <Btn key={l} kind={lvl === l ? "solid" : "ghost"} onClick={() => setLvl(l)}>L{l}</Btn>)}
        <Btn onClick={() => setMode(mode === "3d" ? "2d" : "3d")}>{mode === "3d" ? "2D view" : "3D view"}</Btn></>} />
      <div><OrbitScene orbit={orbit} mode={mode} chains={mockChains} selectedId={sel} onSelect={setSel} height={600} /></div>
    </div>
  );
}
