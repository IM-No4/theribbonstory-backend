import jwt from "jsonwebtoken";
import { getJwtSecret } from "./security.js";

/** Login token for a user; `v` is the user's tokenVersion at issue time */
export const generateToken = (user) => {
  return jwt.sign({ id: user._id, v: user.tokenVersion || 0 }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};
