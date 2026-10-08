import express from "express";
import rateLimit from "express-rate-limit";
import { protect, admin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendTestEmail } from "../services/emailService.js";

const router = express.Router();

const testEmailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });

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

export default router;
