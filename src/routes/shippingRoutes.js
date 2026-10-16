import express from "express";
import {
  checkPincode,
  trackOrderShipment,
  createShipment,
  getShippingLabelPdf,
  handleWebhook,
} from "../controllers/shippingController.js";
import { protect, admin } from "../middleware/auth.js";

const router = express.Router();

// Public Routes
router.post("/check-serviceability", checkPincode);
router.get("/track/:identifier", trackOrderShipment);
router.post("/webhook", handleWebhook);
router.post("/updates", handleWebhook);
router.post("/tracking", handleWebhook);
router.post("/notify", handleWebhook);

// Protected Admin Routes (Shiprocket Fulfillment)
router.post("/create-shipment/:orderId", protect, admin, createShipment);
router.get("/label/:orderId", protect, admin, getShippingLabelPdf);

export default router;
