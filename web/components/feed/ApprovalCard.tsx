"use client";
import { useState } from "react";
import type { Approval } from "@/lib/store";
import { markDone } from "@/lib/guide";
import { toast } from "sonner";

/** One held action. Compact: what, how risky, and two buttons. */
export default function ApprovalCard({ approval, onApprove, onReject }: { approval: Approval; onApprove: () => Promise<unknown> | void; onReject: () => Promise<unknown> | void }) {
  const [busy, setBusy] = useState<"a" | "r" | null>(null);
  const go = async (k: "a" | "r") => { setBusy(k); try { await (k === "a" ? onApprove() : onReject()); if (k === "a") { markDone("approve"); toast.success("Approved. The step ran."); } else toast("Rejected."); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); } };
  const done = approval.status !== "pending";
  const args = Object.entries(approval.args).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join("  ");
  return (
    <div className="card p-4" role="group" aria-label={`Approval for ${approval.tool}`}>
      <div className="flex items-center gap-2"><i aria-hidden className="h-2 w-2 rounded-full bg-amber" /><span className="mono text-[15px] font-medium text-bone">{approval.tool}</span><span className="ml-auto text-[13px] text-muted tnum">risk {Math.round(approval.risk)}</span></div>
      <div className="mono mt-1.5 truncate text-[13px] text-muted" title={args}>{args}</div>
      <div className="mt-3 flex items-center gap-2">
        {done ? <span className="text-[15px] text-muted">{approval.status === "approved" ? "Approved. The step ran." : "Rejected"}</span> : (<>
          <button onClick={() => go("a")} disabled={!!busy} className="btn btn-primary !py-1.5 text-[15px]">{busy === "a" ? "Approving…" : "Approve"}</button>
          <button onClick={() => go("r")} disabled={!!busy} className="btn btn-ghost !py-1.5 text-[15px]">{busy === "r" ? "Rejecting…" : "Reject"}</button></>)}
      </div>
    </div>
  );
}
