import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import Subscriber from "../models/Subscriber.js";
import { sendLaunchWaitlistEmail } from "../services/emailService.js";
import { protect, admin } from "../middleware/auth.js";

const router = express.Router();

// @route   POST /api/subscribers (or /api/waitlist)
// @desc    Join coming soon waitlist / newsletter
// @access  Public
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { email, source } = req.body;

    if (typeof email !== "string" || !email.includes("@") || email.length > 254) {
      return res.status(400).json({ message: "Please provide a valid email address." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if already subscribed
    let subscriber = await Subscriber.findOne({ email: normalizedEmail });

    if (subscriber) {
      if (!subscriber.isSubscribed) {
        subscriber.isSubscribed = true;
        await subscriber.save();
      }
      return res.json({
        success: true,
        alreadySubscribed: true,
        message: "You're already on our VIP launch list! We'll notify you the moment we go live.",
      });
    }

    // Create new subscriber
    subscriber = await Subscriber.create({
      email: normalizedEmail,
      source: typeof source === "string" ? source.slice(0, 50) : "coming-soon",
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });

    // Send confirmation email asynchronously
    sendLaunchWaitlistEmail({ email: normalizedEmail }).catch((err) =>
      console.error("[Subscriber] Error sending waitlist email:", err)
    );

    return res.status(201).json({
      success: true,
      message: "Thank you for joining! You are now on our VIP launch list.",
    });
  })
);

// @route   GET /api/subscribers
// @desc    Get all subscribers (Admin only)
// @access  Private/Admin
router.get(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const subscribers = await Subscriber.find().sort({ createdAt: -1 });
    return res.json({
      success: true,
      count: subscribers.length,
      subscribers,
    });
  })
);

export default router;
