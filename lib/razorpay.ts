import crypto from "node:crypto";
import { config, razorpayEnabled } from "./config";

// Thin client for the Razorpay APIs Sudhaar uses for payments inside India (test mode only):
//   Orders (manual capture: the money is held, like a PayPal authorization)
//   Payments (fetch / capture / refund) -> Route transfers (split to the karigar and the Saathi)
//   Webhooks (HMAC signature check)
// Customers pay with UPI (GPay, PhonePe, Paytm, BHIM…), credit or debit cards, or netbanking.
// Razorpay works in paise (₹1 = 100 paise). Without test keys the same functions return
// clearly marked simulated ids, so the app still runs end to end.

export class RazorpayError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

const sim = (prefix: string) => `SIM-${prefix}_${crypto.randomBytes(6).toString("hex")}`;
export const razorpayMode = () => (razorpayEnabled() ? "test" : "simulated") as "test" | "simulated";
export const isSimulatedId = (id?: string) => Boolean(id?.startsWith("SIM-"));

async function rzp<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const basic = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString("base64");
  const headers: Record<string, string> = { Authorization: `Basic ${basic}`, "Content-Type": "application/json" };
  if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${config.razorpay.apiBase}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new RazorpayError(`Razorpay ${path} failed (${res.status}) ${json.error?.description ?? res.statusText}`, res.status, json.error?.code);
  return json as T;
}

/** Asks Razorpay for one order page: proves the key id and secret work. */
export async function verifyRazorpayKeys(): Promise<{ ok: true } | { ok: false; status?: number; message: string }> {
  try {
    await rzp("/orders?count=1");
    return { ok: true };
  } catch (e) {
    return { ok: false, status: (e as RazorpayError).status, message: (e as Error).message };
  }
}

// ---------- Orders: manual capture, so a successful payment is only "authorized" (held) ----------

export async function createRazorpayOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string>; capture: "manual" | "automatic" }): Promise<{ id: string }> {
  if (!razorpayEnabled()) return { id: sim("order") };
  const res = await rzp<{ id: string }>("/orders", {
    method: "POST",
    body: {
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
      payment: {
        capture: input.capture,
        capture_options: { automatic_expiry_period: 12, manual_expiry_period: config.razorpay.holdMinutes, refund_speed: "optimum" },
      },
    },
  });
  return { id: res.id };
}

/** Checkout sends back order id, payment id and an HMAC signature; only our secret can make that signature. */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string): boolean {
  if (!razorpayEnabled()) return isSimulatedId(orderId) && isSimulatedId(paymentId);
  const expected = crypto.createHmac("sha256", config.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return typeof signature === "string" && signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export interface RazorpayPayment {
  id: string;
  orderId?: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed" | string;
  amountPaise: number;
  method: string;
  /** e.g. "UPI · name@okicici", "Visa credit card ••4242", "Netbanking · HDFC" */
  label: string;
}

const METHOD_NAMES: Record<string, string> = { upi: "UPI", card: "Card", netbanking: "Netbanking", wallet: "Wallet", emi: "EMI" };

/** A readable label for the payment method, without anything sensitive (no full card or UPI id). */
function methodLabel(p: { method?: string; vpa?: string; bank?: string; wallet?: string; card?: { network?: string; type?: string; last4?: string } }) {
  if (p.method === "upi") {
    const handle = p.vpa?.split("@")[1];
    return handle ? `UPI · @${handle}` : "UPI";
  }
  if (p.method === "card" && p.card) return `${p.card.network ?? "Card"} ${p.card.type ?? ""} card ••${p.card.last4 ?? ""}`.replace(/\s+/g, " ").trim();
  if (p.method === "netbanking") return `Netbanking${p.bank ? ` · ${p.bank}` : ""}`;
  if (p.method === "wallet") return `Wallet${p.wallet ? ` · ${p.wallet}` : ""}`;
  return METHOD_NAMES[p.method ?? ""] ?? p.method ?? "Razorpay";
}

/**
 * The payment as Razorpay records it. In simulation the client says which method was picked
 * (UPI / card / netbanking) so the demo shows the same labels as a real payment.
 */
export async function fetchPayment(paymentId: string, simulated?: { amountPaise: number; orderId: string; method?: string }): Promise<RazorpayPayment> {
  if (!razorpayEnabled() || isSimulatedId(paymentId)) {
    const method = ["upi", "card", "netbanking"].includes(simulated?.method ?? "") ? simulated!.method! : "upi";
    const label = method === "upi" ? "UPI · @okaxis (GPay)" : method === "card" ? "Visa debit card ••1111" : "Netbanking · HDFC";
    return { id: paymentId, orderId: simulated?.orderId, status: "authorized", amountPaise: simulated?.amountPaise ?? 0, method, label };
  }
  const p = await rzp<{ id: string; order_id?: string; status: string; amount: number; method: string; vpa?: string; bank?: string; wallet?: string; card?: { network?: string; type?: string; last4?: string } }>(
    `/payments/${encodeURIComponent(paymentId)}?expand[]=card`,
  );
  return { id: p.id, orderId: p.order_id, status: p.status, amountPaise: p.amount, method: p.method, label: methodLabel(p) };
}

/** Takes the held money. Razorpay captures the whole authorized amount; a smaller final bill is refunded right after. */
export async function capturePayment(paymentId: string, amountPaise: number): Promise<{ status: string }> {
  if (!razorpayEnabled() || isSimulatedId(paymentId)) return { status: "captured" };
  const res = await rzp<{ status: string }>(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: "POST",
    body: { amount: amountPaise, currency: "INR" },
    idempotencyKey: `capture-${paymentId}`,
  });
  return { status: res.status };
}

export async function refundPayment(paymentId: string, amountPaise: number, note: string, key: string): Promise<{ refundId: string; status: string }> {
  if (!razorpayEnabled() || isSimulatedId(paymentId)) return { refundId: sim("rfnd"), status: "processed" };
  const res = await rzp<{ id: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: { amount: amountPaise, speed: "optimum", notes: { reason: note.slice(0, 250) }, receipt: key.slice(0, 40) },
    idempotencyKey: `refund-${paymentId}-${key}`,
  });
  return { refundId: res.id, status: res.status };
}

// ---------- Route: split a captured payment to linked accounts (karigar, Saathi) ----------

export interface TransferLine {
  to: "karigar" | "saathi";
  account?: string;
  amountPaise: number;
  note: string;
}

/** One transfer per line. Lines without a linked account (or in simulation) are recorded as simulated. */
export async function transferSplit(paymentId: string, lines: TransferLine[], key: string): Promise<{ id: string; status: string }[]> {
  const real = razorpayEnabled() && !isSimulatedId(paymentId);
  const out: { id: string; status: string }[] = [];
  const toSend = lines.filter((l) => real && l.account);
  let sent: { id: string; status: string }[] = [];
  if (toSend.length) {
    const res = await rzp<{ items: { id: string; status?: string; recipient_settlement_id?: string }[] }>(`/payments/${encodeURIComponent(paymentId)}/transfers`, {
      method: "POST",
      body: { transfers: toSend.map((l) => ({ account: l.account, amount: l.amountPaise, currency: "INR", notes: { purpose: l.note.slice(0, 250) }, on_hold: false })) },
      idempotencyKey: `transfer-${key}`,
    });
    sent = res.items.map((t) => ({ id: t.id, status: (t.status ?? "created").toUpperCase() }));
  }
  let i = 0;
  for (const l of lines) out.push(real && l.account ? sent[i++] ?? { id: sim("trf"), status: "UNKNOWN" } : { id: sim("trf"), status: "SUCCESS" });
  return out;
}

export async function getTransfer(transferId: string): Promise<{ status: string }> {
  if (!razorpayEnabled() || isSimulatedId(transferId)) return { status: "SUCCESS" };
  const t = await rzp<{ status?: string }>(`/transfers/${encodeURIComponent(transferId)}`);
  return { status: (t.status ?? "created").toUpperCase() };
}

// ---------- Webhooks ----------

/** X-Razorpay-Signature is an HMAC-SHA256 of the raw body with the webhook secret. */
export function webhookSignatureValid(rawBody: string, signature: string | null): boolean {
  const secret = config.razorpay.webhookSecret;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function describeRazorpayError(e: unknown): { message: string; ref?: string } {
  if (e instanceof RazorpayError) return { message: e.message, ref: e.code };
  return { message: e instanceof Error ? e.message : String(e) };
}
