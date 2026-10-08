import crypto from "crypto";

let devJwtSecret = null;

/**
 * JWT signing secret. Production refuses to run without JWT_SECRET;
 * development falls back to a random per-process secret (tokens reset on restart).
 */
export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32 && !secret.startsWith("replace-this")) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set to a random string of at least 32 characters in production");
  }
  if (!devJwtSecret) {
    devJwtSecret = crypto.randomBytes(48).toString("hex");
    console.warn("[Security] JWT_SECRET not set — using a random development secret. Logins reset on restart.");
  }
  return devJwtSecret;
};

export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Constant-time string comparison */
export const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export const isObjectId = (value) => typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);
