import { canView } from "@/lib/access";
import { requireRole } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { advance, FlowError, getOrder, reviewCompletion } from "@/lib/orders";
import { orderFor } from "@/lib/privacy";
import { rateLimit } from "@/lib/ratelimit";

// Stage demo (/pitch): plays the partners' side of one repair so a single presenter can show the whole
// journey live. It runs the real order flow (OTP checks, photo check, capture, split) with test money.
// Only for the shared demo customer's own single-item orders, and off when DEMO_ADMIN=off.
type Step = "pickup" | "repair" | "deliver";

export async function POST(req: Request) {
  try {
    rateLimit(req, "pitch", 60);
    if (process.env.DEMO_ADMIN === "off") throw new FlowError("The stage demo is turned off on this deployment", 403);
    const customer = requireRole(req, "customer");
    if (!customer.demo) throw new FlowError("The stage demo only runs on the shared demo account", 403);
    const { orderId, step, afterPhoto } = (await req.json()) as { orderId: string; step: Step; afterPhoto?: string };
    const o = getOrder(orderId);
    if (!o || !canView(customer, o) || o.kind === "basket" || o.mode !== "pickup") throw new FlowError("Order not found", 404);

    if (step === "pickup") {
      // The Saathi arrives; the customer reads out the pickup OTP; the item goes to the karigar.
      await advance(o.id, "pickup", { otp: o.pickupOtp });
      await advance(o.id, "drop_at_karigar");
    } else if (step === "repair") {
      await advance(o.id, "start_repair");
      const after = await advance(o.id, "mark_repaired", { afterPhoto });
      // No AI verdict (or a doubtful one) goes to a person, exactly as in the real flow.
      if (after.status !== "repaired" && after.completionCheck?.needsReview) await reviewCompletion(o.id, { approve: true });
    } else if (step === "deliver") {
      // Out for delivery, then the customer gives the delivery OTP: capture, then the split to partners.
      await advance(o.id, "out_for_delivery");
      await advance(o.id, "deliver", { otp: getOrder(o.id)!.deliveryOtp });
    } else throw new FlowError("Unknown step");

    return ok({ order: orderFor(customer, getOrder(o.id)!) });
  } catch (e) {
    return fail(e);
  }
}
