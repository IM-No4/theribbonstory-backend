import express from "express";
import {
  applyCoupon,
  getAvailableCoupons,
  getAdminCoupons,
  toggleCouponStatus,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from "../controllers/couponController.js";
import { protect, admin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Public routes
router.get("/available", asyncHandler(getAvailableCoupons));
router.post("/apply", asyncHandler(applyCoupon));

// Admin routes
router.get("/admin/all", protect, admin, asyncHandler(getAdminCoupons));
router.post("/", protect, admin, asyncHandler(createCoupon));
router.patch("/:id/toggle", protect, admin, asyncHandler(toggleCouponStatus));
router.put("/:id", protect, admin, asyncHandler(updateCoupon));
router.delete("/:id", protect, admin, asyncHandler(deleteCoupon));

export default router;
