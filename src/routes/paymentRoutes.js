import express from "express";
import { createRazorpayOrder, verifyRazorpayPayment } from "../controllers/paymentController.js";
import { protect } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

router.use(protect);
router.post("/razorpay/order", asyncHandler(createRazorpayOrder));
router.post("/razorpay/verify", asyncHandler(verifyRazorpayPayment));

export default router;
