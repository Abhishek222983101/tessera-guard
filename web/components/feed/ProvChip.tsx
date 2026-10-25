import type { ArgOrigin } from "@/lib/types";

export const trustColor = (t: string) => (t === "untrusted" ? "var(--blood)" : t === "mixed" ? "var(--amber)" : "var(--ice)");
const ORIGIN: Record<string, string> = { user: "your task", trusted_tool: "trusted system", untrusted_chunk: "untrusted text", model_unknown: "agent's own", mixed: "mixed sources" };
const TONE: Record<string, [string, string]> = { untrusted: ["var(--blood)", "var(--blood-bg)"], mixed: ["var(--amber)", "var(--amber-bg)"], trusted: ["var(--ice)", "var(--ice-bg)"] };

/** Where an argument came from: blue = trusted, amber = mixed, red = untrusted. */
export default function ProvChip({ origin, label, name }: { origin: ArgOrigin; label?: string; name?: string }) {
  const [fg, bg] = TONE[origin.trust] ?? TONE.trusted;
  const tip = `${name ? name + ": " : ""}${ORIGIN[origin.origin] ?? origin.origin}${origin.source_label ? " · " + origin.source_label : ""}${origin.control ? " · decides where the action goes" : ""}`;
  return (
    <span title={tip} className="inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-medium" style={{ color: fg, background: bg }}>
      <i aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: fg }} /><span className="truncate">{label ?? ORIGIN[origin.origin]}</span>
      <span className="sr-only">{tip}</span>
    </span>
  );
}
