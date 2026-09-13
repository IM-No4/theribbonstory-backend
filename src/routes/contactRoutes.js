import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendContactInquiryEmails } from "../services/emailService.js";

const router = express.Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email, and message are required" });
    }

    await sendContactInquiryEmails({ name, email, phone, subject, message });

    return res.json({
      success: true,
      message: "Your message has been delivered to our concierge team. We will reply shortly!",
    });
  })
);

export default router;
