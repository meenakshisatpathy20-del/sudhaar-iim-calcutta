"use client";

import { useState } from "react";
import { CreditCard, Globe2, Landmark, ShieldCheck, Smartphone } from "lucide-react";
import type { Order } from "@/lib/types";
import { api } from "./api";
import { orderRupees } from "./Inr";
import { useLang } from "./LanguageProvider";
import { lx, type L8 } from "./localText";
import { PayPalCheckout } from "./PayPalCheckout";
import { useAppConfig } from "./useAppConfig";
import { cn } from "@/lib/utils";

/**
 * Pay inside India: UPI (GPay, PhonePe, Paytm, BHIM…), credit or debit card, or netbanking, through
 * Razorpay Checkout. Bookings and price top-ups are held (manual capture) until the delivery OTP,
 * exactly like the PayPal authorization. Without Razorpay test keys a clearly labelled stand-in sheet
 * lets you pick the method, and the server records a simulated payment.
 */

const T: Record<string, L8> = {
  india: { en: "UPI · GPay · Cards", hi: "UPI · GPay · कार्ड", bn: "UPI · GPay · কার্ড", mr: "UPI · GPay · कार्ड", te: "UPI · GPay · కార్డులు", ta: "UPI · GPay · கார்டுகள்", or: "UPI · GPay · କାର୍ଡ", kn: "UPI · GPay · ಕಾರ್ಡ್" },
  abroad: { en: "PayPal (from abroad)", hi: "PayPal (विदेश से)", bn: "PayPal (বিদেশ থেকে)", mr: "PayPal (परदेशातून)", te: "PayPal (విదేశం నుండి)", ta: "PayPal (வெளிநாட்டிலிருந்து)", or: "PayPal (ବିଦେଶରୁ)", kn: "PayPal (ವಿದೇಶದಿಂದ)" },
  indiaNote: {
    en: "Pay from any UPI app (GPay, PhonePe, Paytm), a credit or debit card, or netbanking. The money is only held until your item is back.",
    hi: "किसी भी UPI ऐप (GPay, PhonePe, Paytm), क्रेडिट या डेबिट कार्ड, या नेटबैंकिंग से भुगतान करें। सामान लौटने तक पैसा सिर्फ़ होल्ड रहेगा।",
    bn: "যেকোনো UPI অ্যাপ (GPay, PhonePe, Paytm), ক্রেডিট বা ডেবিট কার্ড, বা নেটব্যাংকিং দিয়ে পেমেন্ট করুন। জিনিস ফেরত না আসা পর্যন্ত টাকা শুধু হোল্ডে থাকবে।",
    mr: "कोणत्याही UPI ॲप (GPay, PhonePe, Paytm), क्रेडिट किंवा डेबिट कार्ड, किंवा नेटबँकिंगने पैसे भरा. वस्तू परत येईपर्यंत पैसे फक्त होल्डवर राहतील.",
    te: "ఏ UPI యాప్ (GPay, PhonePe, Paytm), క్రెడిట్ లేదా డెబిట్ కార్డ్, లేదా నెట్‌బ్యాంకింగ్‌తోనైనా చెల్లించండి. వస్తువు తిరిగి వచ్చే వరకు డబ్బు హోల్డ్‌లో మాత్రమే ఉంటుంది.",
    ta: "எந்த UPI செயலி (GPay, PhonePe, Paytm), கிரெடிட் அல்லது டெபிட் கார்டு, அல்லது நெட்பேங்கிங் மூலம் செலுத்தலாம். பொருள் திரும்பும் வரை பணம் நிறுத்தத்தில் மட்டுமே இருக்கும்.",
    or: "ଯେକୌଣସି UPI ଆପ (GPay, PhonePe, Paytm), କ୍ରେଡିଟ କିମ୍ବା ଡେବିଟ କାର୍ଡ, କିମ୍ବା ନେଟବ୍ୟାଙ୍କିଙ୍ଗରେ ପେମେଣ୍ଟ କରନ୍ତୁ। ଜିନିଷ ଫେରିବା ପର୍ଯ୍ୟନ୍ତ ଟଙ୍କା କେବଳ ହୋଲ୍ଡରେ ରହିବ।",
    kn: "ಯಾವುದೇ UPI ಆ್ಯಪ್ (GPay, PhonePe, Paytm), ಕ್ರೆಡಿಟ್ ಅಥವಾ ಡೆಬಿಟ್ ಕಾರ್ಡ್, ಅಥವಾ ನೆಟ್‌ಬ್ಯಾಂಕಿಂಗ್ ಮೂಲಕ ಪಾವತಿಸಿ. ವಸ್ತು ಹಿಂತಿರುಗುವವರೆಗೆ ಹಣ ಹೋಲ್ಡ್‌ನಲ್ಲಿ ಮಾತ್ರ ಇರುತ್ತದೆ.",
  },
  abroadNote: {
    en: "For a son or daughter paying from another country. PayPal holds the money the same way.",
    hi: "दूसरे देश से भुगतान करने वाले बेटे या बेटी के लिए। PayPal भी पैसा इसी तरह होल्ड करता है।",
    bn: "অন্য দেশ থেকে পেমেন্ট করা ছেলে বা মেয়ের জন্য। PayPal-ও একইভাবে টাকা হোল্ড করে।",
    mr: "दुसऱ्या देशातून पैसे भरणाऱ्या मुला-मुलीसाठी. PayPal सुद्धा असेच पैसे होल्ड करते.",
    te: "వేరే దేశం నుండి చెల్లించే కొడుకు లేదా కూతురి కోసం. PayPal కూడా డబ్బును ఇలాగే హోల్డ్ చేస్తుంది.",
    ta: "வேறு நாட்டிலிருந்து செலுத்தும் மகன் அல்லது மகளுக்கு. PayPal-ம் இதே போல் பணத்தை நிறுத்தி வைக்கும்.",
    or: "ଅନ୍ୟ ଦେଶରୁ ପେମେଣ୍ଟ କରୁଥିବା ପୁଅ କିମ୍ବା ଝିଅ ପାଇଁ। PayPal ମଧ୍ୟ ସେହିପରି ଟଙ୍କା ହୋଲ୍ଡ କରେ।",
    kn: "ಬೇರೆ ದೇಶದಿಂದ ಪಾವತಿಸುವ ಮಗ ಅಥವಾ ಮಗಳಿಗಾಗಿ. PayPal ಕೂಡ ಹಣವನ್ನು ಹೀಗೆಯೇ ಹೋಲ್ಡ್ ಮಾಡುತ್ತದೆ.",
  },
  pay: { en: "Pay {inr} · UPI / Card", hi: "{inr} भुगतान करें · UPI / कार्ड", bn: "{inr} পেমেন্ট করুন · UPI / কার্ড", mr: "{inr} भरा · UPI / कार्ड", te: "{inr} చెల్లించండి · UPI / కార్డ్", ta: "{inr} செலுத்துங்கள் · UPI / கார்டு", or: "{inr} ପେମେଣ୍ଟ କରନ୍ତୁ · UPI / କାର୍ଡ", kn: "{inr} ಪಾವತಿಸಿ · UPI / ಕಾರ್ಡ್" },
  working: { en: "Confirming with Razorpay…", hi: "Razorpay से पुष्टि हो रही है…", bn: "Razorpay-এর সাথে নিশ্চিত করা হচ্ছে…", mr: "Razorpay कडून पुष्टी होत आहे…", te: "Razorpayతో నిర్ధారిస్తోంది…", ta: "Razorpay உடன் உறுதிசெய்கிறது…", or: "Razorpay ସହ ନିଶ୍ଚିତ କରାଯାଉଛି…", kn: "Razorpay ಜೊತೆ ದೃಢೀಕರಿಸಲಾಗುತ್ತಿದೆ…" },
  simTitle: { en: "Choose how to pay {inr} (simulated: no Razorpay test keys on this server)", hi: "{inr} कैसे भरें, चुनें (सिम्युलेटेड: इस सर्वर पर Razorpay कुंजी नहीं)", bn: "{inr} কীভাবে দেবেন বেছে নিন (সিমুলেটেড: এই সার্ভারে Razorpay কী নেই)", mr: "{inr} कसे भरायचे ते निवडा (सिम्युलेटेड: या सर्व्हरवर Razorpay की नाही)", te: "{inr} ఎలా చెల్లించాలో ఎంచుకోండి (సిమ్యులేటెడ్: ఈ సర్వర్‌లో Razorpay కీలు లేవు)", ta: "{inr} எப்படி செலுத்துவது என தேர்ந்தெடுக்கவும் (உருவகப்படுத்தப்பட்டது: Razorpay விசைகள் இல்லை)", or: "{inr} କିପରି ଦେବେ ବାଛନ୍ତୁ (ସିମୁଲେଟେଡ: ଏହି ସର୍ଭରରେ Razorpay କି ନାହିଁ)", kn: "{inr} ಹೇಗೆ ಪಾವತಿಸಬೇಕು ಆರಿಸಿ (ಸಿಮ್ಯುಲೇಟೆಡ್: ಈ ಸರ್ವರ್‌ನಲ್ಲಿ Razorpay ಕೀಗಳಿಲ್ಲ)" },
  upi: { en: "UPI (GPay)", hi: "UPI (GPay)", bn: "UPI (GPay)", mr: "UPI (GPay)", te: "UPI (GPay)", ta: "UPI (GPay)", or: "UPI (GPay)", kn: "UPI (GPay)" },
  card: { en: "Debit / credit card", hi: "डेबिट / क्रेडिट कार्ड", bn: "ডেবিট / ক্রেডিট কার্ড", mr: "डेबिट / क्रेडिट कार्ड", te: "డెబిట్ / క్రెడిట్ కార్డ్", ta: "டெபிட் / கிரெடிட் கார்டு", or: "ଡେବିଟ / କ୍ରେଡିଟ କାର୍ଡ", kn: "ಡೆಬಿಟ್ / ಕ್ರೆಡಿಟ್ ಕಾರ್ಡ್" },
  netbanking: { en: "Netbanking", hi: "नेटबैंकिंग", bn: "নেটব্যাংকিং", mr: "नेटबँकिंग", te: "నెట్‌బ్యాంకింగ్", ta: "நெட்பேங்கிங்", or: "ନେଟବ୍ୟାଙ୍କିଙ୍ଗ", kn: "ನೆಟ್‌ಬ್ಯಾಂಕಿಂಗ್" },
  testHint: {
    en: "Razorpay test mode (no real money): UPI ID success@razorpay, or card 4111 1111 1111 1111 with any future date and CVV.",
    hi: "Razorpay टेस्ट मोड (असली पैसा नहीं): UPI ID success@razorpay, या कार्ड 4111 1111 1111 1111, कोई भी आगे की तारीख और CVV।",
  },
};

let scriptPromise: Promise<void> | null = null;
function loadCheckoutScript() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load Razorpay Checkout. Check your connection and try again."));
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

type CreateRes = { mode: "test" | "simulated"; keyId: string | null; razorpayOrderId: string; amountPaise: number; description: string; prefill?: { name?: string; contact?: string } };
type RzpResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RzpInstance = { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RzpInstance;
  }
}

export function RazorpayCheckout({
  orderId,
  inrLabel,
  onApproved,
  purpose = "booking",
  tipId,
  token,
}: {
  orderId: string;
  /** The amount as the page shows it in rupees, e.g. "₹468". */
  inrLabel: string;
  onApproved: () => void;
  purpose?: "booking" | "topup" | "tip";
  tipId?: string;
  token?: string;
}) {
  const cfg = useAppConfig();
  const { lang } = useLang();
  const t = (k: string, v?: Record<string, string | number>) => lx(T[k], lang, v);
  const [status, setStatus] = useState<"ready" | "working">("ready");
  const [error, setError] = useState<string | null>(null);
  const url = `/api/orders/${orderId}/razorpay`;

  async function verify(r: RzpResponse, method?: string) {
    await api(url, { action: "verify", purpose, tipId, token, method, ...r });
    onApproved();
  }

  async function pay(simMethod?: string) {
    setError(null);
    setStatus("working");
    try {
      const r = await api<CreateRes>(url, { action: "create", purpose, tipId, token });
      if (r.mode === "simulated" || !r.keyId) {
        const fake = `SIM-pay_${Math.random().toString(16).slice(2, 14)}`;
        await verify({ razorpay_order_id: r.razorpayOrderId, razorpay_payment_id: fake, razorpay_signature: "simulated" }, simMethod);
        return;
      }
      await loadCheckoutScript();
      if (!window.Razorpay) throw new Error("Razorpay Checkout did not load");
      const rzp = new window.Razorpay({
        key: r.keyId,
        order_id: r.razorpayOrderId,
        amount: r.amountPaise,
        currency: "INR",
        name: "Sudhaar",
        description: r.description,
        prefill: r.prefill ?? {},
        notes: { sudhaar_order: orderId },
        theme: { color: "#0f766e" },
        handler: (resp: RzpResponse) => {
          verify(resp).catch((e) => {
            setError((e as Error).message);
            setStatus("ready");
          });
        },
        modal: { ondismiss: () => setStatus("ready") },
      });
      rzp.on("payment.failed", (resp) => {
        setError(resp.error?.description ?? "The payment did not go through. Nothing was charged.");
        setStatus("ready");
      });
      rzp.open();
    } catch (e) {
      setError((e as Error).message);
      setStatus("ready");
    }
  }

  if (!cfg) return null;
  const simulated = cfg.razorpay?.mode !== "test";

  return (
    <div className="space-y-2">
      {simulated ? (
        <div className="space-y-2 rounded-xl bg-teal/5 p-3 ring-1 ring-teal/30">
          <p className="text-xs font-semibold">{t("simTitle", { inr: inrLabel })}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["upi", <Smartphone key="u" className="size-4" />],
              ["card", <CreditCard key="c" className="size-4" />],
              ["netbanking", <Landmark key="n" className="size-4" />],
            ].map(([m, icon]) => (
              <button
                key={m as string}
                disabled={status === "working"}
                onClick={() => pay(m as string)}
                className="flex flex-col items-center gap-1 rounded-xl bg-white px-2 py-3 text-xs font-semibold ring-1 ring-border hover:ring-teal disabled:opacity-50"
              >
                {icon}
                {t(m as string)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <button
            disabled={status === "working"}
            onClick={() => pay()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f766e] px-4 py-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            <Smartphone className="size-4" /> {t("pay", { inr: inrLabel })}
          </button>
          <p className="rounded-xl bg-teal/5 px-3 py-2 text-[11px] text-muted-foreground ring-1 ring-teal/20">{t("testHint")}</p>
        </>
      )}
      {status === "working" && <p className="text-xs text-muted-foreground">{t("working")}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * The booking payment: UPI / cards inside India (default), or PayPal for family paying from abroad.
 * Both hold the money until the delivery OTP.
 */
export function PaymentChooser({ order, onApproved, token, defaultTab = "india" }: { order: Order; onApproved: () => void; token?: string; defaultTab?: "india" | "abroad" }) {
  const { lang } = useLang();
  const [tab, setTab] = useState<"india" | "abroad">(defaultTab);
  const t = (k: string) => lx(T[k], lang);
  const inr = orderRupees(order);
  return (
    <div className="space-y-3">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(
          [
            ["india", <Smartphone key="i" className="size-4" />],
            ["abroad", <Globe2 key="a" className="size-4" />],
          ] as const
        ).map(([k, icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn("flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold", tab === k ? "bg-white shadow-sm ring-1 ring-border" : "text-muted-foreground")}
          >
            {icon}
            {t(k)}
          </button>
        ))}
      </div>
      <p className="flex gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-teal" /> {t(tab === "india" ? "indiaNote" : "abroadNote")}
      </p>
      {tab === "india" ? (
        <RazorpayCheckout orderId={order.id} inrLabel={inr} onApproved={onApproved} token={token} />
      ) : (
        order.paypal.orderId && <PayPalCheckout orderId={order.id} paypalOrderId={order.paypal.orderId} total={order.total} inrLabel={inr} onApproved={onApproved} token={token} />
      )}
    </div>
  );
}
