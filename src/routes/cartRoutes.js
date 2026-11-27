import express from "express";
import SavedCart from "../models/SavedCart.js";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { escapeHtml } from "../utils/security.js";
import {
  resolveCartLines,
  cartSignature,
  lastOrderDates,
  validUnsubscribe,
} from "../services/cartService.js";

const router = express.Router();

// The signed-in customer's saved bag, used to bring it back on another device
router.get(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    const cart = await SavedCart.findOne({ user: req.user._id });
    if (!cart) return res.json({ items: [] });

    // Already bought since it was saved: don't bring it back
    const ordered = (await lastOrderDates([req.user._id])).get(String(req.user._id));
    if (ordered && ordered > cart.changedAt) {
      await SavedCart.deleteOne({ user: req.user._id });
      return res.json({ items: [] });
    }

    const lines = await resolveCartLines(cart.toObject().items);
    res.json({
      items: lines
        .filter((l) => !l.custom)
        .map((l) => ({
          productId: l.productId,
          name: l.name,
          image: l.image,
          price: l.basePrice,
          quantity: l.quantity,
          stock: l.stock,
          selectedOptions: l.options,
          customization: {},
        })),
    });
  })
);

router.put(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    const lines = await resolveCartLines(req.body?.items);
    if (!lines.length) {
      await SavedCart.deleteOne({ user: req.user._id });
      return res.json({ success: true });
    }
    const existing = await SavedCart.findOne({ user: req.user._id });
    if (!existing || cartSignature(existing.items) !== cartSignature(lines)) {
      await SavedCart.findOneAndUpdate(
        { user: req.user._id },
        { $set: { items: lines, changedAt: new Date() } },
        { upsert: true }
      );
    }
    res.json({ success: true });
  })
);

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#FFFDF8;color:#4A1F29;display:flex;justify-content:center;padding:48px 16px}
main{max-width:420px;text-align:center}button{background:#4A1F29;color:#fff;border:0;border-radius:12px;padding:14px 28px;font-size:15px;cursor:pointer}</style>
</head><body><main><h1>${title}</h1>${body}</main></body></html>`;

const invalidLink = (res) =>
  res.status(400).send(page("Link not valid", "<p>Please use the link from your latest email.</p>"));

// Shown first so that email scanners opening the link don't unsubscribe anyone
router.get("/unsubscribe", (req, res) => {
  const { u, s } = req.query;
  if (!validUnsubscribe(u, s)) return invalidLink(res);
  res.send(
    page(
      "Stop cart reminders?",
      `<p>You'll still receive emails about orders you place.</p>
<form method="post" action="/api/cart/unsubscribe">
<input type="hidden" name="u" value="${escapeHtml(u)}"><input type="hidden" name="s" value="${escapeHtml(s)}">
<button type="submit">Unsubscribe</button></form>`
    )
  );
});

router.post(
  "/unsubscribe",
  asyncHandler(async (req, res) => {
    // The form sends them in the body; mail apps' one-click unsubscribe uses the address
    const u = req.body?.u || req.query.u;
    const s = req.body?.s || req.query.s;
    if (!validUnsubscribe(u, s)) return invalidLink(res);
    await User.updateOne({ _id: u }, { $set: { cartReminderOptOut: true } });
    res.send(page("You're unsubscribed", "<p>We won't send you any more cart reminders.</p>"));
  })
);

export default router;
