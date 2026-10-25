"use client";
import { ReactNode } from "react";
import { LAYERS } from "@/lib/types";
import { Hint } from "@/components/ui/kit";

export const LAYER_COLOR: Record<string, string> = {
  contract: "var(--l-contract)", provenance: "var(--l-provenance)", decoy: "var(--l-decoy)", content: "var(--l-content)", chain: "var(--l-chain)",
  context: "var(--l-context)", sequence: "var(--l-sequence)", params: "var(--l-params)", intent: "var(--l-intent)", drift: "var(--l-drift)",
};
export const LAYER_LABEL: Record<string, string> = {
  contract: "Contract", provenance: "Provenance", decoy: "Decoys", content: "Content", chain: "Chain", context: "Context", sequence: "Sequence", params: "Parameters", intent: "Intent", drift: "Drift",
};
export const LAYER_ORDER = LAYERS;

export function PageHead({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl"><h1 className="text-[28px] font-semibold leading-tight text-bone">{title}</h1>{sub && <p className="mt-1.5 text-[15px] text-muted">{sub}</p>}</div>
      {right && <div className="flex flex-wrap items-center gap-3">{right}</div>}
    </header>
  );
}
export const SampleBadge = () => <span className="rounded-md bg-amberbg px-2 py-0.5 text-[13px] font-medium text-amber" title="The core isn't reachable, so this page shows sample data">Sample data</span>;
export function Tag({ kind }: { kind: "MEASURED" | "TARGET" | "EXT" | string }) {
  const m = kind === "MEASURED";
  return <span className={`mono rounded-md px-2 py-0.5 text-[12.5px] font-medium ${m ? "bg-mossbg text-moss" : "bg-amberbg text-amber"}`}>{kind}</span>;
}
export function Btn({ children, onClick, kind = "ghost", disabled, title, type = "button" }: { children: ReactNode; onClick?: () => void; kind?: "ghost" | "solid" | "danger"; disabled?: boolean; title?: string; type?: "button" | "submit" }) {
  const k = { ghost: "btn-ghost", solid: "btn-primary", danger: "btn-danger" }[kind];
  return <button type={type} title={title} disabled={disabled} onClick={onClick} className={`btn ${k}`}>{children}</button>;
}
export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-line2 p-5"><div className="text-[15px] font-medium text-bone">{title}</div>{hint && <div className="text-[15px] text-muted">{hint}</div>}{action && <div className="mt-2">{action}</div>}</div>;
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-blood/30 bg-bloodbg p-3.5 text-[15px] text-blood"><span>{message}</span>{onRetry && <Btn onClick={onRetry}>Try again</Btn>}</div>;
}
export const Skeleton = ({ h = 80 }: { h?: number }) => <div className="animate-pulse rounded-lg bg-panel2" style={{ height: h }} aria-busy="true" />;
export function Section({ title, hint, children, right }: { title: string; hint?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return <section className="card min-w-0 p-5"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-[16px] font-semibold text-bone">{title}{hint && <Hint>{hint}</Hint>}</h2>{right}</div>{children}</section>;
}
export const levelName = (l: number) => ["Observe", "Step-up", "Narrow", "Quarantine", "Decoy sandbox", "Killed"][l] ?? `L${l}`;
export const bandOf = (r: number) => (r >= 80 ? "critical" : r >= 60 ? "high" : r >= 30 ? "elevated" : "normal");
export const bandColor = (r: number) => (r >= 80 ? "var(--blood)" : r >= 60 ? "var(--ember)" : r >= 30 ? "var(--amber)" : "var(--moss)");
