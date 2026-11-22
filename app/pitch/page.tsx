"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BadgeCheck, Bike, Camera, IndianRupee, Loader2, MapPin, RotateCcw, ShieldCheck, Sparkles, Star, Wrench } from "lucide-react";
import { api } from "@/components/api";
import { orderRupees, rupees } from "@/components/Inr";
import { Logo } from "@/components/Logo";
import { RazorpayCheckout } from "@/components/RazorpayCheckout";
import { TrustReceipt } from "@/components/TrustReceipt";
import { useAppConfig } from "@/components/useAppConfig";
import type { Order, Quote } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Stage demo for a live pitch. One repair, start to finish, one big screen per step.
 * Everything on screen comes from the real app (AI quote, karigar offers, UPI hold, OTPs, capture,
 * Route split) running with test money. Next: → / Space / PageDown (works with a slide clicker).
 */

type Offer = { karigar: { id: string; shop: string; name: string; rating: number; ratingCount?: number }; distanceKm: number; price: number; pickupFee: number; total: number; readyInDays: number; best?: boolean };
type State = { quote?: Quote; offers?: Offer[]; order?: Order };

const ITEM = "Mixer grinder jar blade is loose and it rattles";

const STEPS = [
  { key: "intro", title: "Repair, don't replace" },
  { key: "quote", title: "Snap it. AI prices the repair." },
  { key: "compare", title: "Verified karigars nearby, compared" },
  { key: "pay", title: "Pay by UPI. The money is only held." },
  { key: "pickup", title: "Repair Saathi picks it up, OTP checked" },
  { key: "repair", title: "The karigar repairs it, photos checked" },
  { key: "deliver", title: "Delivered. Payment captured and split." },
  { key: "receipt", title: "Every step has proof" },
] as const;

async function afterPhotoFile(): Promise<string> {
  // A labelled stand-in "after" photo for the stage demo (the real karigar app uses the camera).
  const c = document.createElement("canvas");
  c.width = 480;
  c.height = 320;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e7f6f2";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#0f766e";
  g.font = "bold 28px sans-serif";
  g.fillText("After repair (demo photo)", 60, 170);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
  const fd = new FormData();
  fd.append("file", blob, "after.png");
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const j = await res.json();
  if (!res.ok || !j.file) throw new Error(j.error ?? "Could not upload the after photo");
  return j.file;
}

export default function PitchDemo() {
  const cfg = useAppConfig();
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [s, setS] = useState<State>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const order = s.order;
  const paid = Boolean(order && order.status !== "awaiting_payment" && order.status !== "cancelled");

  const refreshOrder = useCallback(async () => {
    if (!s.order) return;
    const r = await api<{ order: Order }>(`/api/orders/${s.order.id}`);
    setS((x) => ({ ...x, order: r.order }));
  }, [s.order]);

  /** Runs the work that brings step `to` on screen. */
  const run = useCallback(
    async (to: number) => {
      const key = STEPS[to].key;
      if (key === "quote") {
        await api("/api/auth/demo", { role: "customer" });
        const r = await api<{ quote: Quote; offers: Offer[] }>("/api/quote", { description: ITEM, category: "small-appliance" });
        setS({ quote: r.quote, offers: r.offers });
      } else if (key === "pay") {
        const best = s.offers?.[0];
        if (!s.quote || !best) throw new Error("Get the quote first");
        const r = await api<{ order: Order }>("/api/orders", { quoteId: s.quote.id, karigarId: best.karigar.id });
        setS((x) => ({ ...x, order: r.order }));
      } else if (key === "pickup" || key === "repair" || key === "deliver") {
        if (!s.order) throw new Error("Book the repair first");
        const afterPhoto = key === "repair" ? await afterPhotoFile() : undefined;
        const r = await api<{ order: Order }>("/api/pitch", { orderId: s.order.id, step: key, afterPhoto });
        setS((x) => ({ ...x, order: r.order }));
      }
    },
    [s.offers, s.order, s.quote],
  );

  const canNext = step < STEPS.length - 1 && !busy && !(STEPS[step].key === "pay" && !paid);

  const next = useCallback(async () => {
    if (!canNext) return;
    const to = step + 1;
    setError(null);
    if (to <= reached) return setStep(to); // already done: just show it again
    setBusy(true);
    try {
      await run(to);
      setStep(to);
      setReached(to);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canNext, reached, run, step]);

  const back = useCallback(() => setStep((x) => Math.max(0, x - 1)), []);
  const restart = () => {
    setS({});
    setStep(0);
    setReached(0);
    setError(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.closest("input,textarea,select,[role=dialog]")) return;
      // Space / Enter on a focused button already presses that button; arrows and PageUp/Down (clickers) always work.
      if (el?.closest("button,a") && [" ", "Enter"].includes(e.key)) return;
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, next]);

  const live = cfg?.razorpay?.mode === "test" ? "Razorpay test mode" : "simulated payments";

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-[#fff8ee] via-white to-[#e9f7f3]">
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-white px-3 py-1 font-semibold ring-1 ring-border">Live demo · test money · {live}</span>
          <button onClick={restart} className="flex items-center gap-1 rounded-full bg-white px-3 py-1 ring-1 ring-border hover:bg-muted" aria-label="Restart the demo">
            <RotateCcw className="size-3.5" /> Restart
          </button>
        </div>
      </header>

      <div className="mx-auto h-1.5 w-full max-w-5xl overflow-hidden rounded-full bg-muted px-0 sm:w-[calc(100%-4rem)]">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-teal transition-all" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
      </div>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-8 sm:py-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold leading-tight sm:text-5xl">{STEPS[step].title}</h1>
        <div className="mt-6 flex-1 sm:mt-10">
          <Body stepKey={STEPS[step].key} s={s} onPaid={refreshOrder} />
        </div>
        {error && <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </section>

      <footer className="flex items-center justify-between gap-3 border-t bg-white/70 px-4 py-3 backdrop-blur sm:px-8">
        <button onClick={back} disabled={step === 0 || busy} className="flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-border disabled:opacity-40">
          <ArrowLeft className="size-4" /> Back
        </button>
        <p className="hidden text-xs text-muted-foreground sm:block">→ / Space / clicker for next · ← for back</p>
        <button
          onClick={next}
          disabled={!canNext}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {STEPS[step].key === "pay" && !paid ? "Pay to continue" : step === STEPS.length - 1 ? "Done" : "Next"} <ArrowRight className="size-4" />
        </button>
      </footer>
    </main>
  );
}

function Stat({ label, value, sub, tone = "default" }: { label: string; value: React.ReactNode; sub?: string; tone?: "default" | "good" | "brand" }) {
  return (
    <div className={cn("rounded-2xl bg-white p-4 shadow-sm ring-1 ring-border sm:p-6", tone === "good" && "ring-teal/40", tone === "brand" && "ring-primary/40")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-3xl font-bold sm:text-4xl", tone === "good" && "text-teal", tone === "brand" && "text-primary")}>{value}</p>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Body({ stepKey, s, onPaid }: { stepKey: (typeof STEPS)[number]["key"]; s: State; onPaid: () => void }) {
  const { quote, offers, order } = s;
  const inr = (paise?: number) => `₹${((paise ?? 0) / 100).toLocaleString("en-IN")}`;

  if (stepKey === "intro")
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="The moment" value="It broke" sub="A mixer blade, a bag zip, a chappal: small repairs" />
        <Stat label="Today" value="Buy new" sub="No one nearby you can find, trust, or who collects it" />
        <Stat label="With Sudhaar" value="Repaired" sub="Local karigar, doorstep pickup, pay only after it's back" tone="brand" />
      </div>
    );

  if (stepKey === "quote" && quote) {
    const mid = (quote.repairLow + quote.repairHigh) / 2;
    const saving = quote.newPrice > 0 ? Math.round((1 - mid / quote.newPrice) * 100) : null;
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 rounded-2xl bg-white p-4 text-lg ring-1 ring-border">
          <Camera className="size-5 text-primary" /> &ldquo;{ITEM}&rdquo;
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Repair estimate" value={`${rupees(quote.repairLow)}–${rupees(quote.repairHigh)}`} sub={quote.item} tone="brand" />
          <Stat label="Buying new" value={rupees(quote.newPrice)} sub="what people usually do" />
          <Stat label="You save" value={saving !== null ? `~${saving}%` : "—"} sub="by repairing instead" tone="good" />
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4" /> {quote.source === "gemini" ? "Priced by Gemini from the photo and description" : "Priced from Sudhaar's rate table (AI key not set on this server)"}
        </p>
      </div>
    );
  }

  if (stepKey === "compare" && offers)
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {offers.slice(0, 3).map((o, i) => (
          <div key={o.karigar.id} className={cn("rounded-2xl bg-white p-5 shadow-sm ring-1 ring-border", i === 0 && "ring-2 ring-primary")}>
            {i === 0 && <p className="mb-2 inline-block rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">Best match · booked</p>}
            <p className="flex items-center gap-1 text-lg font-bold">
              {o.karigar.shop} <BadgeCheck className="size-4 text-primary" />
            </p>
            <p className="text-sm text-muted-foreground">{o.karigar.name}</p>
            <div className="mt-3 space-y-1 text-sm">
              <p className="flex items-center gap-2">
                <MapPin className="size-4 text-muted-foreground" /> {o.distanceKm} km away
              </p>
              <p className="flex items-center gap-2">
                <Star className="size-4 text-marigold" /> {o.karigar.ratingCount ? `${o.karigar.rating} rating` : "New karigar"}
              </p>
              <p className="flex items-center gap-2">
                <Wrench className="size-4 text-muted-foreground" /> Ready in {o.readyInDays} day{o.readyInDays === 1 ? "" : "s"}
              </p>
            </div>
            <p className="mt-3 font-display text-2xl font-bold">{rupees(o.total)}</p>
            <p className="text-xs text-muted-foreground">
              repair {rupees(o.price)} + pickup {rupees(o.pickupFee)}
            </p>
          </div>
        ))}
      </div>
    );

  if (stepKey === "pay" && order) {
    const paid = order.status !== "awaiting_payment";
    return (
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <Stat label="Bill" value={orderRupees(order)} sub={`${order.item} · order ${order.id}`} />
          {paid ? (
            <Stat label="Held, not taken" value={inr(order.razorpay?.heldPaise)} sub={order.razorpay?.methodLabel ?? "UPI"} tone="good" />
          ) : (
            <p className="flex gap-2 rounded-2xl bg-teal/10 p-4 text-sm">
              <ShieldCheck className="size-5 shrink-0 text-teal" /> The karigar won&apos;t start on unpaid work, and you won&apos;t pay for something you haven&apos;t got back. So the money is held until the delivery OTP.
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-border">
          {paid ? (
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-lg font-bold text-teal">
                <BadgeCheck className="size-5" /> Payment held
              </p>
              <p>Pickup OTP on the customer&apos;s phone: <b className="font-mono text-xl tracking-widest">{order.pickupOtp}</b></p>
              <p className="text-muted-foreground">Nothing is captured until the item is back.</p>
            </div>
          ) : (
            <RazorpayCheckout orderId={order.id} inrLabel={orderRupees(order)} onApproved={onPaid} />
          )}
        </div>
      </div>
    );
  }

  if (stepKey === "pickup" && order)
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pickup OTP" value="Verified" sub="Read out by the customer, checked on the server. Partners never see it." tone="good" />
        <Stat label="Repair Saathi" value={<Bike className="inline size-9" />} sub="Nearest available Saathi, one trip, live tracking link for the family" />
        <Stat label="Status" value="At the karigar" sub={`Handed over · ${order.id}`} tone="brand" />
      </div>
    );

  if (stepKey === "repair" && order)
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Before / after photos" value="Compared" sub={order.completionCheck?.reasoning ?? "Photo check done"} tone="good" />
        <Stat label="Checked by" value={order.completionCheck?.source === "gemini" ? "AI" : "A person"} sub="If AI is unsure or unavailable, a person reviews. AI never releases money." />
        <Stat label="Money" value="Still held" sub="Nothing captured yet" tone="brand" />
      </div>
    );

  if (stepKey === "deliver" && order) {
    const t = order.razorpay?.transfers ?? [];
    const captured = order.razorpay?.capturedPaise ?? 0;
    const partners = t.reduce((a, x) => a + x.amountPaise, 0);
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Captured on delivery OTP" value={inr(captured)} sub="only now" tone="brand" />
          {t.map((x) => (
            <Stat key={x.id} label={x.to === "karigar" ? "Karigar gets" : "Saathi gets"} value={inr(x.amountPaise)} sub={`${x.label} · paid right away`} tone="good" />
          ))}
          <Stat label="Sudhaar keeps" value={inr(Math.max(0, captured - partners))} sub="10% of repair + 25% of pickup" />
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <IndianRupee className="size-4" /> Split with Razorpay Route the moment the delivery OTP is confirmed.
        </p>
      </div>
    );
  }

  if (stepKey === "receipt" && order)
    return (
      <div className="grid gap-6 sm:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3">
          <Stat label="Proven steps" value="Quote → hold → OTP → photos → OTP → capture → payout" tone="good" />
          <Link href={`/orders/${order.id}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline">
            Open this order in the app <ArrowRight className="size-4" />
          </Link>
        </div>
        <TrustReceipt order={order} quote={s.quote} />
      </div>
    );

  return <p className="text-muted-foreground">Press Next to start.</p>;
}
