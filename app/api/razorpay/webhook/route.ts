import { readDB, updateDB } from "@/lib/db";
import { ok } from "@/lib/http";
import { approveRazorpay, getOrder } from "@/lib/orders";
import { webhookSignatureValid } from "@/lib/razorpay";

// Razorpay webhook receiver. Subscribe it (Dashboard → Webhooks, test mode) to payment.authorized,
// payment.captured, payment.failed, refund.processed and transfer.processed, with RAZORPAY_WEBHOOK_SECRET.
// payment.authorized also completes a booking whose customer paid by UPI but closed the tab before
// the browser could report it, so nobody pays without the booking going through.
type Entity = { id?: string; order_id?: string; status?: string; payment_id?: string; source?: string; notes?: Record<string, string> };

export async function POST(req: Request) {
  const raw = await req.text();
  const verified = webhookSignatureValid(raw, req.headers.get("x-razorpay-signature"));
  let event: { event?: string; payload?: Record<string, { entity?: Entity }> } | null = null;
  try {
    event = JSON.parse(raw);
  } catch {
    event = null;
  }
  if (!event?.event) return ok({ ignored: true });
  const type = event.event;
  const entity = event.payload?.payment?.entity ?? event.payload?.refund?.entity ?? event.payload?.transfer?.entity ?? {};
  const eventId = req.headers.get("x-razorpay-event-id") ?? undefined;
  // Razorpay retries deliveries: the same event id is processed once.
  const duplicate = Boolean(eventId && readDB().webhooks.some((w) => w.eventId === eventId && w.verified));
  const orderId = entity.notes?.sudhaar_order;

  if (verified && !duplicate && type === "payment.authorized" && orderId && entity.notes?.purpose === "booking" && entity.id && entity.order_id) {
    const o = getOrder(orderId);
    if (o?.status === "awaiting_payment" && o.razorpay?.orderId === entity.order_id) {
      try {
        await approveRazorpay(orderId, "booking", { razorpayOrderId: entity.order_id, paymentId: entity.id, fromWebhook: true });
      } catch {
        // The order stays unpaid; the event is still logged below for the admin.
      }
    }
  }

  await updateDB((db) => {
    db.webhooks.push({ at: new Date().toISOString(), type, resource: entity.id, verified, eventId, duplicate: duplicate || undefined, provider: "razorpay" });
    if (db.webhooks.length > 200) db.webhooks.splice(0, db.webhooks.length - 200);
    if (!verified || duplicate) return;
    const paymentId = entity.payment_id ?? entity.source ?? entity.id;
    const o = db.orders.find((x) => (orderId && x.id === orderId) || (x.rail === "razorpay" && (x.razorpay?.paymentId === paymentId || x.razorpay?.transfers?.some((t) => t.id === entity.id))));
    if (!o) return;
    // Route transfers report their final status here; keep the partner's payout line in step.
    if (type.startsWith("transfer.") && entity.id) {
      const status = (entity.status ?? type.split(".")[1]).toUpperCase();
      for (const t of o.razorpay?.transfers ?? []) if (t.id === entity.id) t.status = status;
      for (const p of o.payouts) if (p.payoutItemId === entity.id) p.status = status;
    }
    o.events.push({ at: new Date().toISOString(), actor: "system", kind: "paypal", message: `Razorpay webhook received: ${type}`, ref: entity.id });
  });
  return ok({ received: true, verified, duplicate });
}
