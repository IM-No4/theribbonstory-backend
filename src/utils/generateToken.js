import jwt from "jsonwebtoken";
import { getJwtSecret } from "./security.js";

export const generateToken = (userId) => {
  return jwt.sign({ id: userId }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};
