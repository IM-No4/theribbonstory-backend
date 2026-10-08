import express from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendContactInquiryEmails } from "../services/emailService.js";

const router = express.Router();

// Each submission sends an acknowledgement email to the submitted address
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many messages sent. Please try again later." },
});

const isShortString = (v, max) => typeof v === "string" && v.length <= max;

router.post(
  "/",
  contactLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email, and message are required" });
    }
    if (
      !isShortString(name, 100) ||
      !isShortString(email, 254) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !isShortString(message, 5000) ||
      (phone !== undefined && !isShortString(phone, 30)) ||
      (subject !== undefined && !isShortString(subject, 200))
    ) {
      return res.status(400).json({ message: "Please check your details and try again" });
    }

    await sendContactInquiryEmails({ name, email, phone, subject, message });

    return res.json({
      success: true,
      message: "Your message has been delivered to our concierge team. We will reply shortly!",
    });
  })
);

export default router;
