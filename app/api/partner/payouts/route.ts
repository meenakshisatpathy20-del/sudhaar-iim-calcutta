import { requireRole } from "@/lib/auth";
import { readDB, updateDB } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { describePayPalError, getPayoutBatch } from "@/lib/paypal";
import { getTransfer } from "@/lib/razorpay";

// "Check with PayPal": asks the Payouts API for the latest status of this partner's payout batches
// (PENDING -> SUCCESS, or UNCLAIMED if the email has no PayPal account yet) and saves it.
export async function POST(req: Request) {
  try {
    const account = requireRole(req, "karigar", "saathi", "admin");
    const id = account.karigarId ?? account.saathiId;
    const db = readDB();
    const mine = db.orders.filter((o) => o.paypal.payoutBatchId && o.payouts.some((p) => account.role === "admin" || p.partnerId === id));
    // UPI / card orders were split with Razorpay Route: ask Razorpay for each transfer's status.
    const transfers: { orderId: string; transferId: string; status: string }[] = [];
    for (const o of mine.filter((x) => x.rail === "razorpay")) {
      const ids = [...(o.razorpay?.transfers ?? []).map((t) => t.id), ...(o.tips ?? []).map((t) => t.payoutBatchId).filter((x): x is string => Boolean(x))];
      for (const transferId of ids.slice(0, 10)) {
        try {
          transfers.push({ orderId: o.id, transferId, status: (await getTransfer(transferId)).status });
        } catch {
          // keep the last known status
        }
      }
    }
    const orders = mine.filter((o) => o.rail !== "razorpay");
    const batches = new Map<string, string>();
    for (const o of orders) {
      batches.set(o.paypal.payoutBatchId!, o.id);
      for (const t of o.tips ?? []) if (t.payoutBatchId) batches.set(t.payoutBatchId, o.id);
    }
    const results: { batchId: string; status: string; error?: string }[] = [];
    for (const batchId of [...batches.keys()].slice(0, 15)) {
      try {
        const b = await getPayoutBatch(batchId);
        results.push({ batchId, status: b.status });
      } catch (e) {
        results.push({ batchId, status: "UNKNOWN", error: describePayPalError(e).message });
      }
    }
    await updateDB((db2) => {
      for (const t of transfers) {
        const o = db2.orders.find((x) => x.id === t.orderId);
        for (const x of o?.razorpay?.transfers ?? []) if (x.id === t.transferId) x.status = t.status;
        for (const p of o?.payouts ?? []) if (p.payoutItemId === t.transferId || (p.kind === "tip" && o?.tips?.some((tp) => tp.payoutBatchId === t.transferId && tp.karigarId === p.partnerId))) p.status = t.status;
        results.push({ batchId: t.transferId, status: t.status });
      }
      for (const r of results) {
        if (r.status === "UNKNOWN") continue;
        for (const o of db2.orders) {
          if (o.rail === "razorpay") continue;
          const isMain = o.paypal.payoutBatchId === r.batchId;
          const tip = o.tips?.find((t) => t.payoutBatchId === r.batchId);
          for (const p of o.payouts) {
            if (isMain && p.kind !== "tip") p.status = r.status;
            if (tip && p.kind === "tip" && p.partnerId === tip.karigarId && p.amount === tip.amount) p.status = r.status;
          }
        }
      }
    });
    return ok({ checked: results.length, results });
  } catch (e) {
    return fail(e);
  }
}
