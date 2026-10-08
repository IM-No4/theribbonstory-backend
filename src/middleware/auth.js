import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { getJwtSecret } from "../utils/security.js";
import { readAuthCookie } from "../utils/authCookie.js";
import { isAllowedOrigin } from "../utils/origins.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Origin of a request as sent by the browser (Origin, else Referer) */
const requestOrigin = (req) => {
  if (req.headers.origin) return req.headers.origin;
  try {
    return req.headers.referer ? new URL(req.headers.referer).origin : null;
  } catch {
    return null;
  }
};

export const protect = async (req, res, next) => {
  try {
    // Browsers authenticate with the httpOnly session cookie; the Bearer header
    // remains for non-browser clients (scripts, tests)
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.split(" ")[1] : null;
    const token = bearer || readAuthCookie(req);
    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    // CSRF defence in depth for cookie sessions: state-changing requests must
    // come from our own storefront (SameSite=Lax already blocks other sites)
    if (!bearer && !SAFE_METHODS.has(req.method)) {
      const origin = requestOrigin(req);
      if (origin && !isAllowedOrigin(origin)) {
        return res.status(403).json({ message: "Request origin not allowed" });
      }
    }

    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(401).json({ message: "User no longer exists" });
    // Signed out everywhere (password/email changed since this token was issued)
    if ((decoded.v || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ message: "Session expired, please log in again" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Not authorized, token invalid" });
  }
};

export const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") return next();
  return res.status(403).json({ message: "Admin access required" });
};

/** Attach req.user when a valid session is present; anonymous requests continue */
export const optionalUser = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    const token = (header?.startsWith("Bearer ") ? header.split(" ")[1] : null) || readAuthCookie(req);
    if (token) {
      const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
      const user = await User.findById(decoded.id).select("-password");
      if (user && (decoded.v || 0) === (user.tokenVersion || 0)) req.user = user;
    }
  } catch {
    // invalid or expired token: treat as anonymous
  }
  next();
};
