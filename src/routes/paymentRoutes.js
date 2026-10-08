import express from "express";
import { createRazorpayOrder, verifyRazorpayPayment, razorpayWebhook } from "../controllers/paymentController.js";
import { protect } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Called by Razorpay's servers (signature-verified), so no login
router.post("/razorpay/webhook", asyncHandler(razorpayWebhook));

router.use(protect);
router.post("/razorpay/order", asyncHandler(createRazorpayOrder));
router.post("/razorpay/verify", asyncHandler(verifyRazorpayPayment));

export default router;
