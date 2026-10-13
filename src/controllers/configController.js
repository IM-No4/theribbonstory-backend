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

  res.json({
    comingSoon,
    googleClientId,
    razorpayKeyId,
  });
};
