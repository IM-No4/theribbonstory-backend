import express from "express";
import rateLimit from "express-rate-limit";
import { protect, admin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendTestEmail } from "../services/emailService.js";

const router = express.Router();

const testEmailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });

import { setComingSoonOverride, isComingSoonActive } from "../controllers/configController.js";

import StudioSettings from "../models/StudioSettings.js";
import { getShippingSettings, parseShippingSettings } from "../services/shippingSettings.js";
import { buildReport } from "../services/analyticsReport.js";
import SavedCart from "../models/SavedCart.js";
import User from "../models/User.js";
import Coupon from "../models/Coupon.js";
import { sendCartReminderEmail, CART_REMINDER_SUBJECT, CART_REMINDER_MESSAGE } from "../services/emailService.js";
import { apiPublicUrl } from "./seoRoutes.js";
import {
  resolveCartLines,
  cartTotal,
  lastOrderDates,
  unsubscribeSignature,
  REMINDER_MIN_IDLE_MS,
  REMINDER_COOLDOWN_MS,
} from "../services/cartService.js";
import { isObjectId } from "../utils/security.js";
import { getStudioRecipients, sendTestOrderAlert } from "../services/studioAlerts.js";

// Send a test email to the signed-in admin to check the SMTP settings
router.post(
  "/test-email",
  protect,
  admin,
  testEmailLimiter,
  asyncHandler(async (req, res) => {
    const result = await sendTestEmail({ to: req.user.email });
    res.status(result.ok ? 200 : 502).json(result);
  })
);

// Get order notification email settings (admin only)
router.get(
  "/notification-settings",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    let settings = await StudioSettings.findOne({ key: "default" }).lean();
    const fallbackRecipients = (process.env.STUDIO_ALERT_EMAIL || process.env.ADMIN_EMAIL || "contact@theribbonstory.com")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    const configured = Array.isArray(settings?.orderNotificationEmails)
      ? settings.orderNotificationEmails
      : [];

    res.json({
      success: true,
      emails: configured,
      activeRecipients: configured.length > 0 ? configured : fallbackRecipients,
      fallbackRecipients,
    });
  })
);

// Update order notification email settings (admin only)
router.put(
  "/notification-settings",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { emails } = req.body;
    if (!Array.isArray(emails)) {
      return res.status(400).json({ message: "emails must be an array of email strings" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const sanitized = [
      ...new Set(
        emails
          .map((e) => String(e || "").trim().toLowerCase())
          .filter((e) => emailRegex.test(e))
      ),
    ];

    let settings = await StudioSettings.findOne({ key: "default" });
    if (!settings) {
      settings = new StudioSettings({ key: "default" });
    }
    settings.orderNotificationEmails = sanitized;
    await settings.save();

    res.json({
      success: true,
      message: "Order notification recipient emails saved successfully",
      emails: sanitized,
    });
  })
);

// Send a test new-order notification alert to the configured/specified emails
router.post(
  "/notification-settings/test",
  protect,
  admin,
  testEmailLimiter,
  asyncHandler(async (req, res) => {
    const { emails } = req.body || {};
    try {
      const result = await sendTestOrderAlert(emails);
      res.json({
        success: true,
        message: `Test order notification sent to: ${result.recipients.join(", ")}`,
        recipients: result.recipients,
      });
    } catch (err) {
      res.status(502).json({
        success: false,
        message: err.message || "Failed to send test order notification email",
      });
    }
  })
);

// Update Coming Soon mode at runtime (admin only)
router.put(
  "/coming-soon",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { enabled } = req.body;
    setComingSoonOverride(Boolean(enabled));
    res.json({ success: true, comingSoon: isComingSoonActive() });
  })
);

// Turn custom (personalized) keepsakes on or off storefront-wide (admin only)
router.get(
  "/custom-keepsakes",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const settings = await StudioSettings.findOne({ key: "default" }).lean();
    res.json({ success: true, enabled: settings?.customKeepsakesEnabled !== false });
  })
);

router.put(
  "/custom-keepsakes",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const enabled = Boolean(req.body.enabled);
    await StudioSettings.findOneAndUpdate(
      { key: "default" },
      { $set: { customKeepsakesEnabled: enabled } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, enabled });
  })
);

// Store performance: visits, products, funnel and ad sources (admin only)
router.get(
  "/analytics",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    res.json({ success: true, report: await buildReport(String(req.query.range || "7d")) });
  })
);

// Carts that customers filled but haven't ordered
router.get(
  "/abandoned-carts",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const carts = await SavedCart.find({})
      .sort({ changedAt: -1 })
      .limit(300)
      .populate("user", "name email role cartReminderOptOut lastCartReminderAt");
    const shoppers = carts.filter((c) => c.user && c.user.role !== "admin" && c.items.length);
    const ordered = await lastOrderDates(shoppers.map((c) => c.user._id));

    res.json({
      success: true,
      defaults: { subject: CART_REMINDER_SUBJECT, message: CART_REMINDER_MESSAGE },
      rules: { minIdleMinutes: REMINDER_MIN_IDLE_MS / 60000, cooldownHours: REMINDER_COOLDOWN_MS / 3600000 },
      carts: shoppers
        .filter((c) => !(ordered.get(String(c.user._id)) > c.changedAt))
        .map((c) => ({
          userId: String(c.user._id),
          name: c.user.name,
          email: c.user.email,
          items: c.items.map((i) => ({
            name: i.name,
            image: i.image,
            quantity: i.quantity,
            price: i.price,
            options: i.options.map((o) => o.value),
          })),
          total: cartTotal(c.items),
          changedAt: c.changedAt,
          lastReminderAt: c.user.lastCartReminderAt || null,
          optedOut: Boolean(c.user.cartReminderOptOut),
        })),
    });
  })
);

router.post(
  "/abandoned-carts/:userId/remind",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const refuse = (message, status = 400) => res.status(status).json({ success: false, message });
    const { userId } = req.params;
    if (!isObjectId(userId)) return refuse("Customer not found", 404);

    const [user, cart] = await Promise.all([User.findById(userId), SavedCart.findOne({ user: userId })]);
    if (!user || !cart?.items.length) return refuse("This cart is now empty", 404);
    if (user.cartReminderOptOut) return refuse(`${user.email} has unsubscribed from reminders`);
    const now = Date.now();
    if (now - cart.changedAt.getTime() < REMINDER_MIN_IDLE_MS) {
      return refuse("This cart changed within the last hour. The customer may still be shopping.");
    }
    if (user.lastCartReminderAt && now - user.lastCartReminderAt.getTime() < REMINDER_COOLDOWN_MS) {
      return refuse(`${user.email} already got a reminder in the last 24 hours`);
    }
    if ((await lastOrderDates([user._id])).get(String(user._id)) > cart.changedAt) {
      return refuse("This customer has ordered since filling the cart");
    }

    // Current names, prices and availability
    const items = await resolveCartLines(cart.toObject().items);
    if (!items.length) return refuse("Nothing in this cart can be bought right now");
    const total = cartTotal(items);

    let coupon = null;
    const code = heroText(req.body?.couponCode, 40).toUpperCase();
    if (code) {
      coupon = await Coupon.findOne({ code, isActive: true });
      if (!coupon || (coupon.validUntil && coupon.validUntil < new Date())) return refuse(`Coupon ${code} is not active`);
      if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return refuse(`Coupon ${code} is used up`);
      if (coupon.minOrderAmount > total) {
        return refuse(`Coupon ${code} needs ₹${coupon.minOrderAmount}, but this cart is ₹${total}`);
      }
    }

    // Claim the 24 hour slot first so a double click can't send two emails
    const previous = user.lastCartReminderAt || null;
    const claim = await User.updateOne(
      { _id: user._id, lastCartReminderAt: previous },
      { $set: { lastCartReminderAt: new Date(now) } }
    );
    if (claim.modifiedCount !== 1) return refuse("A reminder is already being sent");

    try {
      await sendCartReminderEmail({
        to: user.email,
        name: user.name,
        items,
        total,
        subject: heroText(req.body?.subject, 120),
        message: heroText(req.body?.message, 1000),
        coupon,
        unsubscribeUrl: `${apiPublicUrl()}/api/cart/unsubscribe?u=${user._id}&s=${unsubscribeSignature(user._id)}`,
      });
    } catch (err) {
      await User.updateOne({ _id: user._id }, { $set: { lastCartReminderAt: previous } });
      console.error("[CartReminder] Send failed:", err.message);
      return refuse(`Email could not be sent: ${err.message}`, 502);
    }
    res.json({ success: true, message: `Reminder sent to ${user.email}`, lastReminderAt: new Date(now) });
  })
);

// Delivery charges (admin only)
router.get(
  "/shipping-settings",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    res.json({ success: true, shipping: await getShippingSettings() });
  })
);

router.put(
  "/shipping-settings",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { values, error } = parseShippingSettings(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    await StudioSettings.findOneAndUpdate(
      { key: "default" },
      { $set: { shipping: values } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, shipping: values });
  })
);

// Seasonal hero theme for the home page (admin only)
const HERO_PRESETS = ["custom", "christmas", "newyear", "diwali", "valentine"];
const heroText = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const hostedImage = (value) => typeof value === "string" && /^\/(uploads|images)\/[\w./-]+$/.test(value);

router.get(
  "/hero-theme",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const settings = await StudioSettings.findOne({ key: "default" }).select("heroTheme heroThemeDrafts").lean();
    res.json({
      success: true,
      heroTheme: settings?.heroTheme || { enabled: false },
      drafts: settings?.heroThemeDrafts || {},
    });
  })
);

const sanitizeTheme = (b = {}) => {
  const ctaLink = heroText(b.ctaLink, 200);
  return {
    badge: heroText(b.badge, 60),
    headline: heroText(b.headline, 60),
    highlight: heroText(b.highlight, 60),
    subtext: heroText(b.subtext, 240),
    overlayText: heroText(b.overlayText, 90),
    ctaText: heroText(b.ctaText, 40),
    ctaLink: ctaLink.startsWith("/") && !ctaLink.startsWith("//") ? ctaLink : "/shop",
    bannerText: heroText(b.bannerText, 140),
    images: (Array.isArray(b.images) ? b.images : []).filter(hostedImage).slice(0, 5),
    mobileImages: (Array.isArray(b.mobileImages) ? b.mobileImages : []).filter(hostedImage).slice(0, 5),
    pageBackground: hostedImage(b.pageBackground) ? b.pageBackground : "",
    effect: ["none", "snow", "hearts", "sparkles"].includes(b.effect) ? b.effect : "none",
    collectionSlug: typeof b.collectionSlug === "string" && /^[a-z0-9-]{1,80}$/.test(b.collectionSlug) ? b.collectionSlug : "",
  };
};

router.put(
  "/hero-theme",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const preset = HERO_PRESETS.includes(b.preset) ? b.preset : "custom";
    const heroTheme = { enabled: Boolean(b.enabled), preset, ...sanitizeTheme(b) };

    // Every theme keeps its own saved images and text.
    const drafts = {};
    const incoming = b.drafts && typeof b.drafts === "object" ? b.drafts : {};
    for (const key of HERO_PRESETS) {
      if (incoming[key]) drafts[key] = sanitizeTheme(incoming[key]);
    }
    const { enabled, preset: _p, ...activeFields } = heroTheme;
    drafts[preset] = activeFields;

    await StudioSettings.findOneAndUpdate(
      { key: "default" },
      { $set: { heroTheme, heroThemeDrafts: drafts } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, heroTheme, drafts });
  })
);

export default router;

