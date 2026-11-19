import StudioSettings from "../models/StudioSettings.js";

let comingSoonOverride = null;

export const setComingSoonOverride = (val) => {
  comingSoonOverride = typeof val === "boolean" ? val : null;
};

export const isComingSoonActive = () => {
  if (comingSoonOverride !== null) return comingSoonOverride;
  const val = process.env.COMING_SOON;
  return val === "true" || val === "1";
};

/**
 * GET /api/config
 * Public system configuration for storefront bootstrapping.
 * Never leaks private secrets (like JWT secrets, API private keys, or OAuth client secrets).
 */
export const getPublicConfig = async (req, res) => {
  const comingSoon = isComingSoonActive();
  const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID || "";

  let customKeepsakesEnabled = true;
  let heroTheme = null;
  try {
    const settings = await StudioSettings.findOne({ key: "default" }).select("customKeepsakesEnabled heroTheme").lean();
    if (settings && settings.customKeepsakesEnabled === false) customKeepsakesEnabled = false;
    if (settings?.heroTheme?.enabled) {
      const { enabled, ...theme } = settings.heroTheme;
      heroTheme = theme;
    }
  } catch (err) {
    console.warn("[config] Could not read custom keepsake setting:", err.message);
  }

  res.json({
    comingSoon,
    customKeepsakesEnabled,
    heroTheme,
    googleClientId,
    razorpayKeyId,
  });
};
