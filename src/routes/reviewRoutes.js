import express from "express";
import {
  getProductReviews,
  createReview,
  getAdminReviews,
  toggleApproveReview,
  deleteReview,
} from "../controllers/reviewController.js";
import { protect, admin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Public routes
router.get("/product/:productId", asyncHandler(getProductReviews));

// Authenticated customer route
router.post("/", protect, asyncHandler(createReview));

// Admin routes
router.get("/admin/all", protect, admin, asyncHandler(getAdminReviews));
router.put("/:id/toggle", protect, admin, asyncHandler(toggleApproveReview));
router.delete("/:id", protect, admin, asyncHandler(deleteReview));

export default router;
