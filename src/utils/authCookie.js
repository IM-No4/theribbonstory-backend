import { generateToken } from "./generateToken.js";

export const AUTH_COOKIE = "trs_token";

const cookieOptions = () => ({
  httpOnly: true, // not readable from JavaScript, so XSS cannot steal the session
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax", // not sent on cross-site POSTs (CSRF)
  path: "/",
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
});

const parseDurationMs = (value) => {
  const match = /^(\d+)\s*([smhd])?$/.exec(String(value || "").trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] || "s"];
  return Number(match[1]) * unit;
};

/** Issue a session: signed JWT in an httpOnly cookie (never in the response body) */
export const setAuthCookie = (res, user) => {
  res.cookie(AUTH_COOKIE, generateToken(user), {
    ...cookieOptions(),
    maxAge: parseDurationMs(process.env.JWT_EXPIRES_IN || "7d"),
  });
};

export const clearAuthCookie = (res) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions());
};

export const readAuthCookie = (req) => {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === AUTH_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
};
