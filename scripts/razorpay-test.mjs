// End-to-end test of the India payment rail (UPI / cards / netbanking through Razorpay) and the
// OTP brute-force lock, against a running Sudhaar server in simulated mode (no Razorpay keys).
// Usage: npm run test:india -- http://localhost:3000
const BASE = process.argv[2] ?? "http://localhost:3000";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { (cond ? pass++ : failN++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
function session() {
  let cookie = "";
  return async (path, body, method) => {
    const res = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("sudhaar_session=")) cookie = c.split(";")[0];
    let j; try { j = await res.json(); } catch { j = {}; }
    return { status: res.status, ...j };
  };
}
const cust = session(), saathi = session(), kar = session(), admin = session();
await cust("/api/auth/demo", { role: "customer" });
await saathi("/api/auth/demo", { role: "saathi" });
await kar("/api/auth/demo", { role: "karigar" });
await admin("/api/auth/demo", { role: "admin" });
const cfg = await session()("/api/config");
check("config reports the India rail", cfg.razorpay?.mode === "simulated" || cfg.razorpay?.mode === "test", `mode=${cfg.razorpay?.mode}`);
check("config exposes no Razorpay secret", !/secret/i.test(JSON.stringify(cfg.razorpay ?? {})));

async function book() {
  const q = await cust("/api/quote", { description: "Mixer grinder jar blade is loose" });
  const created = await cust("/api/orders", { quoteId: q.quote.id, karigarId: q.offers[0].karigar.id });
  return created.order;
}
// The demo Saathi / karigar logins open the partners of the latest booking that is waiting on them.
async function partnersFor() {
  await saathi("/api/auth/demo", { role: "saathi" });
  await kar("/api/auth/demo", { role: "karigar" });
}

// ---- 1. Pay a booking by UPI: money held, not taken ----
let order = await book();
const id = order.id;
const rz = `/api/orders/${id}/razorpay`;
const c1 = await cust(rz, { action: "create", purpose: "booking" });
check("Razorpay order created", c1.razorpayOrderId && c1.amountPaise > 0, `${c1.razorpayOrderId} ₹${c1.amountPaise / 100}`);
const c2 = await cust(rz, { action: "create", purpose: "booking" });
check("same Razorpay order reused on retry", c2.razorpayOrderId === c1.razorpayOrderId);
const bad = await cust(rz, { action: "verify", purpose: "booking", razorpay_order_id: "order_wrong", razorpay_payment_id: "SIM-pay_x1", razorpay_signature: "x" });
check("payment for another Razorpay order rejected", bad.status >= 400, bad.error);
const forged = await cust(rz, { action: "verify", purpose: "booking", razorpay_order_id: c1.razorpayOrderId, razorpay_payment_id: "pay_REAL_LOOKING", razorpay_signature: "forged" });
check("unsigned / forged payment rejected", forged.status >= 400, forged.error);
const anon = await session()(rz, { action: "create", purpose: "booking" });
check("stranger cannot start a payment", anon.status === 404, `status=${anon.status}`);
const v = await cust(rz, { action: "verify", purpose: "booking", razorpay_order_id: c1.razorpayOrderId, razorpay_payment_id: "SIM-pay_test1", razorpay_signature: "simulated", method: "upi" });
order = v.order;
check("UPI payment held (authorized)", order?.status === "authorized" && order.rail === "razorpay", order?.razorpay?.methodLabel);
check("nothing captured yet", !order?.paypal.captureId);
const v2 = await cust(rz, { action: "verify", purpose: "booking", razorpay_order_id: c1.razorpayOrderId, razorpay_payment_id: "SIM-pay_test1", razorpay_signature: "simulated", method: "upi" });
check("repeat confirmation is harmless", v2.order?.status === "authorized");
const otps = (await cust(`/api/orders/${id}`)).order;
await partnersFor();

// ---- 2. OTP brute-force lock ----
let last;
for (let i = 0; i < 5; i++) last = await saathi(`/api/orders/${id}/action`, { action: "pickup", otp: String(1000 + i) === otps.pickupOtp ? "0000" : String(1000 + i) });
check("5 wrong pickup OTPs lock the handover", last.status >= 400 && /Too many/i.test(last.error ?? ""), last.error);
const rotated = (await cust(`/api/orders/${id}`)).order;
check("pickup OTP replaced after the lock", rotated.pickupOtp !== otps.pickupOtp);
const locked = await saathi(`/api/orders/${id}/action`, { action: "pickup", otp: rotated.pickupOtp });
check("even the right OTP waits out the pause", locked.status === 429, locked.error);
console.log("      (the paused order stays paused; the full lifecycle continues on a fresh order)");

// ---- 3. Full UPI lifecycle on a fresh order: capture on delivery, Route split, refund, tip ----
order = await book();
const id2 = order.id;
const rz2 = `/api/orders/${id2}/razorpay`;
const o1 = await cust(rz2, { action: "create", purpose: "booking" });
const paid = await cust(rz2, { action: "verify", purpose: "booking", razorpay_order_id: o1.razorpayOrderId, razorpay_payment_id: "SIM-pay_test2", razorpay_signature: "simulated", method: "card" });
check("card payment held", paid.order?.status === "authorized", paid.order?.razorpay?.methodLabel);
const full = (await cust(`/api/orders/${id2}`)).order;
await partnersFor();
const step = async (who, body) => who(`/api/orders/${id2}/action`, body);
check("pickup", (await step(saathi, { action: "pickup", otp: full.pickupOtp })).order?.status === "picked_up");
check("at karigar", (await step(saathi, { action: "drop_at_karigar" })).order?.status === "at_karigar");
check("repair started", (await step(kar, { action: "start_repair" })).order?.status === "repairing");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const fd = new FormData(); fd.append("file", new Blob([png], { type: "image/png" }), "a.png");
const up = await (await fetch(BASE + "/api/uploads", { method: "POST", body: fd })).json();
const mr = await step(kar, { action: "mark_repaired", afterPhoto: up.file });
if (mr.order?.status !== "repaired") await admin(`/api/orders/${id2}/review`, { approve: true });
check("out for delivery", (await step(saathi, { action: "out_for_delivery" })).order?.status === "out_for_delivery");
const dl = await step(saathi, { action: "deliver", otp: full.deliveryOtp });
const fin = (await cust(`/api/orders/${id2}`)).order;
check("delivery OTP captures the UPI/card hold", fin.paypal.captureId && fin.razorpay.capturedPaise === fin.razorpay.heldPaise, `₹${fin.razorpay.capturedPaise / 100}`);
check("Route transfers to karigar and Saathi", fin.status === "paid_out" && fin.razorpay.transfers?.length === 2, (fin.razorpay.transfers ?? []).map((t) => `${t.label} ₹${t.amountPaise / 100} ${t.status}`).join(", "));
check("no PayPal call on a UPI order", !fin.paypal.invoiceId && fin.paypal.orderId?.startsWith("SIM-ORDER") !== undefined);
const again = await step(saathi, { action: "deliver", otp: full.deliveryOtp });
check("repeat delivery does not capture twice", again.status >= 400);

const cl = await cust(`/api/orders/${id2}/complaint`, { issue: "repair_failed", details: "Blade is loose again after two days" });
check("claim raised on a UPI order", cl.order?.complaints?.length === 1, cl.error);
const claimId = cl.order.complaints[0].id;
const rf = await admin(`/api/orders/${id2}/resolve`, { complaintId: claimId, action: "refund", amount: 1, remarks: "Partial refund for the trouble" });
const fin2 = (await cust(`/api/orders/${id2}`)).order;
check("refund goes back through Razorpay", fin2.paypal.refunds.length === 1 && fin2.events.some((e) => /via Razorpay/.test(e.message)), rf.error ?? fin2.paypal.refunds[0]?.id);

const kId = fin2.karigarId;
const tip = await cust(`/api/orders/${id2}/tip`, { karigarId: kId, inr: 50 });
const tipId = tip.order?.tips?.find((t) => t.status === "awaiting_payment")?.id;
check("tip started on the UPI rail (no PayPal order)", tipId && !tip.order.tips[0].paypalOrderId, tip.error);
const tc = await cust(rz2, { action: "create", purpose: "tip", tipId });
const tv = await cust(rz2, { action: "verify", purpose: "tip", tipId, razorpay_order_id: tc.razorpayOrderId, razorpay_payment_id: "SIM-pay_tip1", razorpay_signature: "simulated", method: "upi" });
const t2 = tv.order?.tips?.find((t) => t.id === tipId);
check("₹50 tip paid and sent in full to the karigar", t2?.status === "paid" && tc.amountPaise === 5000 && tv.order.payouts.some((p) => p.kind === "tip"), tv.error);

console.log(`\n${pass} passed, ${failN} failed. Orders ${id}, ${id2}`);
process.exit(failN ? 1 : 0);
