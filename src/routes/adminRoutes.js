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

