import express from "express";
import {
  createOrder,
  getMyOrders,
  getOrderById,
  trackOrder,
  getAdminOrders,
  updateOrderStatus,
  getAdminStats,
  issueOrderRefund,
  requestOrderCancellation,
  getOrderRefundStatus,
} from "../controllers/orderController.js";
import { protect, admin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Admin Routes (mounted first)
router.get("/admin/stats", protect, admin, asyncHandler(getAdminStats));
router.get("/admin/all", protect, admin, asyncHandler(getAdminOrders));
router.put("/:id/status", protect, admin, asyncHandler(updateOrderStatus));
router.post("/:id/refund", protect, admin, asyncHandler(issueOrderRefund));

// Public Tracking & Status Route
router.get("/track/:identifier", asyncHandler(trackOrder));
router.get("/:id/refund-status", asyncHandler(getOrderRefundStatus));

// Customer Routes
router.post("/", protect, asyncHandler(createOrder));
router.get("/my", protect, asyncHandler(getMyOrders));
router.get("/:id", protect, asyncHandler(getOrderById));
router.post("/:id/cancel", protect, asyncHandler(requestOrderCancellation));

export default router;
