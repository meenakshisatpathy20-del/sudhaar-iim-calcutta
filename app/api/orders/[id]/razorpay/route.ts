import crypto from "node:crypto";
import { canView } from "@/lib/access";
import { currentAccount } from "@/lib/auth";
import { config } from "@/lib/config";
import { fail, ok } from "@/lib/http";
import { approveRazorpay, FlowError, getOrder, startRazorpay, type RazorpayPurpose } from "@/lib/orders";
import { orderFor } from "@/lib/privacy";
import { razorpayMode } from "@/lib/razorpay";
import { rateLimit } from "@/lib/ratelimit";

const sameToken = (a?: string, b?: string) => Boolean(a && b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)));
const PURPOSES: RazorpayPurpose[] = ["booking", "topup", "tip"];

// UPI / cards / netbanking through Razorpay.
//   { action: "create", purpose }  -> the Razorpay order the checkout opens
//   { action: "verify", purpose, razorpay_order_id, razorpay_payment_id, razorpay_signature } -> hold the payment
// Allowed for the customer who booked, an admin, or a family member holding the Family Pay link
// (tips: the booking customer only), the same rules as PayPal approval.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    rateLimit(req, "razorpay", 60);
    const { id } = await params;
    const body = (await req.json()) as {
      action: "create" | "verify";
      purpose?: RazorpayPurpose;
      token?: string;
      tipId?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
      /** Simulation only: which method the demo sheet picked (upi / card / netbanking). */
      method?: string;
    };
    const purpose = PURPOSES.includes(body.purpose as RazorpayPurpose) ? (body.purpose as RazorpayPurpose) : "booking";
    const account = currentAccount(req);
    const order = getOrder(id);
    const allowed = order && ((account && (account.role === "customer" || account.role === "admin") && canView(account, order)) || sameToken(body.token, order.familyPay?.token));
    if (!allowed) throw new FlowError("Order not found", 404);
    if (purpose === "tip" && account?.role !== "customer") throw new FlowError("Order not found", 404);

    if (body.action === "create") {
      const r = await startRazorpay(id, purpose, body.tipId);
      const payer = account?.role === "customer" ? account : undefined;
      return ok({
        mode: razorpayMode(),
        keyId: razorpayMode() === "test" ? config.razorpay.keyId : null,
        razorpayOrderId: r.razorpayOrderId,
        amountPaise: r.amountPaise,
        description: r.description,
        // Prefill only for the signed-in customer; a Family Pay payer types their own details.
        prefill: payer && !order.familyPay ? { name: payer.name, contact: payer.phone ? `+91${payer.phone}` : undefined } : undefined,
      });
    }
    if (body.action !== "verify") throw new FlowError("Unknown action");
    if (!body.razorpay_order_id || !body.razorpay_payment_id) throw new FlowError("Missing Razorpay payment details");
    // Simulated payments carry a SIM- id; with real test keys the signature check rejects them.
    const after = await approveRazorpay(id, purpose, {
      razorpayOrderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
      tipId: body.tipId,
      simulatedMethod: body.method,
    });
    return ok({ order: orderFor(account, after) });
  } catch (e) {
    return fail(e);
  }
}
