import type { Decision } from "@/lib/types";

const MAP: Record<Decision, { c: string; bg: string; label: string; short: string }> = {
  ALLOW: { c: "var(--moss)", bg: "var(--moss-bg)", label: "Allowed", short: "Allowed" },
  DENY: { c: "var(--blood)", bg: "var(--blood-bg)", label: "Blocked", short: "Blocked" },
  STEP_UP: { c: "var(--amber)", bg: "var(--amber-bg)", label: "Needs your OK", short: "Needs OK" },
  MODIFY: { c: "var(--ice)", bg: "var(--ice-bg)", label: "Cleaned", short: "Cleaned" },
  DEFER: { c: "var(--violet)", bg: "var(--violet-bg)", label: "Deferred", short: "Deferred" },
};
const SOLID: Record<Decision, string> = { ALLOW: "var(--moss)", DENY: "var(--blood)", STEP_UP: "var(--amber)", MODIFY: "var(--ice)", DEFER: "var(--violet)" };
export const decisionColor = (d: Decision) => SOLID[d] ?? "var(--muted)";
export const bandColor = (b: string) => ({ normal: "var(--moss)", elevated: "var(--amber)", high: "var(--ember)", critical: "var(--blood)" }[b] ?? "var(--muted)");

/** Small tinted chip: a dot plus a word, so state never relies on colour alone. */
export default function VerdictChip({ decision, compact }: { decision: Decision; compact?: boolean }) {
  const m = MAP[decision] ?? MAP.DEFER;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[13px] font-medium" style={{ color: m.c, background: m.bg }}>
      <i aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: m.c }} />{compact ? m.short : m.label}
    </span>
  );
}
