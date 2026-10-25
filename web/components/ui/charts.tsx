"use client";
import { useEffect, useRef, useState } from "react";
import { scaleLinear } from "@visx/scale";
import { LinePath, AreaClosed } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null); const [w, setW] = useState(480);
  useEffect(() => { if (!ref.current) return; const ro = new ResizeObserver((e) => setW(Math.max(160, e[0].contentRect.width))); ro.observe(ref.current); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}
export interface Pt { x: number; y: number }
export interface Series { name: string; color: string; points: Pt[]; area?: boolean }

export function LineChart({ series, h = 160, threshold, thresholdLabel, yMax, yFmt = (v: number) => String(Math.round(v * 100) / 100), xLabel, label }: {
  series: Series[]; h?: number; threshold?: number; thresholdLabel?: string; yMax?: number; yFmt?: (v: number) => string; xLabel?: string; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>(); const m = { l: 44, r: 12, t: 10, b: 26 };
  const all = series.flatMap((s) => s.points); const xs = all.map((p) => p.x); const ys = all.map((p) => p.y);
  const x0 = Math.min(...xs, 0), x1 = Math.max(...xs, 1); const y1 = yMax ?? Math.max(...ys, threshold ?? 0, 1) * 1.1;
  const sx = scaleLinear({ domain: [x0, x1], range: [m.l, w - m.r] }); const sy = scaleLinear({ domain: [0, y1], range: [h - m.b, m.t] });
  const ticks = [0, y1 / 2, y1];
  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={h} role="img" aria-label={label}>
        {ticks.map((t) => (<g key={t}><line x1={m.l} x2={w - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" /><text x={m.l - 6} y={sy(t) + 3} textAnchor="end" fontSize="12" fill="var(--muted)" className="mono">{yFmt(t)}</text></g>))}
        {threshold !== undefined && (<g><line x1={m.l} x2={w - m.r} y1={sy(threshold)} y2={sy(threshold)} stroke="var(--blood)" strokeDasharray="5 5" /><text x={w - m.r} y={sy(threshold) - 4} textAnchor="end" fontSize="12" fill="var(--blood)">{thresholdLabel ?? "alarm"}</text></g>)}
        {series.map((s) => (<g key={s.name}>
          {s.area && <AreaClosed data={s.points} x={(d) => sx(d.x)} y={(d) => sy(d.y)} yScale={sy} curve={curveMonotoneX} fill={s.color} fillOpacity={0.14} />}
          <LinePath data={s.points} x={(d) => sx(d.x)} y={(d) => sy(d.y)} stroke={s.color} strokeWidth={2} curve={curveMonotoneX} /></g>))}
        {xLabel && <text x={(m.l + w - m.r) / 2} y={h - 4} textAnchor="middle" fontSize="12" fill="var(--muted)">{xLabel}</text>}
      </svg>
      {series.length > 1 && <div className="mt-1 flex gap-4 text-[15px] text-muted">{series.map((s) => <span key={s.name}><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: s.color }} />{s.name}</span>)}</div>}
    </div>
  );
}

export function HBar({ label, value, max, color = "var(--ice)", right }: { label: string; value: number; max: number; color?: string; right?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,250px)_1fr_auto] items-center gap-3 py-1.5 text-[15px]">
      <span className="mono truncate text-muted" title={label}>{label}</span>
      <div className="h-2 rounded-full bg-panel3" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}><div className="h-2 rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, (value / Math.max(max, 1e-9)) * 100)}%`, background: color }} /></div>
      <span className="mono tnum w-14 text-right font-medium text-bone">{right ?? value}</span>
    </div>
  );
}
