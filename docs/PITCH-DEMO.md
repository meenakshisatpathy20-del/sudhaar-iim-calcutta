# Pitch demo: one repair in about 2½ minutes

Open **`/pitch`** on the deployed site (or `http://localhost:3000/pitch`) before you go on stage.
It plays one real repair from start to finish, one big screen per step, with test money only.
Every number on screen comes from the app at that moment: nothing is typed in or made up.

**Controls:** → / Space / PageDown (a slide clicker works) for next, ← for back, **Restart** (top right) to run it again.
Step 4 waits until you pay; everything else is one press.

## Before you present
1. Open `/pitch` once and run it through to the end, so the server is awake (the free Render plan sleeps).
2. Press **Restart**, leave it on step 1.
3. With Razorpay test keys set, step 4 opens the real Razorpay sheet: pay with UPI ID **`success@razorpay`**.
   Without keys, tap **UPI (GPay)** on the stand-in sheet (labelled "simulated" on screen).
4. Keep a screen recording of a full run as a backup in case the venue Wi-Fi fails.

## What to say (one or two lines per screen)

| # | Screen | Say |
|---|---|---|
| 1 | Repair, don't replace | "Small things break at home: a mixer blade, a zip, a chappal. The repairer is down the street, but you can't find one you trust, nobody collects it, so you buy new." |
| 2 | AI prices the repair | "You snap a photo. AI prices the repair against buying new: here a few hundred rupees against about two thousand." *(If it says "rate table", the AI key isn't set: say "priced from our rate table".)* |
| 3 | Karigars compared | "Verified local karigars, compared by total price, distance, rating and ready time. We book the best match." |
| 4 | Pay by UPI, only held | "You pay by UPI, card or netbanking, but the money is only **held**. The karigar knows the money is there; you don't pay for something you haven't got back." → *pay* |
| 5 | Saathi pickup | "A Repair Saathi, a student or local helper, collects it. The customer reads out an OTP, so the handover is proven. Guessing the code doesn't work: wrong tries lock it." |
| 6 | Repair, photos checked | "The karigar uploads an after photo. AI compares before and after; if it's unsure, a person checks. AI never releases money." |
| 7 | Captured and split | "Only when the customer gives the delivery OTP is the money taken, and it's split at once: the karigar keeps 90% of the repair, the Saathi most of the pickup fee, and this is what Sudhaar keeps." *(Point at the four numbers.)* |
| 8 | Trust Receipt | "Every step has its proof: a payment id, an OTP check, a photo review. A step only turns green when its evidence exists." |

## Questions this demo invites, and honest answers
- **"Is this real money?"** No, test money (Razorpay test mode / PayPal sandbox). The flow, checks and ids are the same as a live payment.
- **"Who pays if the repair fails after the karigar is paid?"** Today Sudhaar absorbs refunds from its share; a warranty re-repair by the same karigar is free.
- **"Why won't customers call the karigar directly next time?"** The held payment, the warranty, free pickup with Care, and for the karigar: steady jobs and payment right after delivery.
- **"Do you have users?"** Answer with what you really have. Don't present demo numbers as traction.
