import express from "express";
import {
  applyCoupon,
  getAdminCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from "../controllers/couponController.js";
import { protect, admin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Public route to apply coupon
router.post("/apply", asyncHandler(applyCoupon));

// Admin routes
router.get("/admin/all", protect, admin, asyncHandler(getAdminCoupons));
router.post("/", protect, admin, asyncHandler(createCoupon));
router.put("/:id", protect, admin, asyncHandler(updateCoupon));
router.delete("/:id", protect, admin, asyncHandler(deleteCoupon));

export default router;
