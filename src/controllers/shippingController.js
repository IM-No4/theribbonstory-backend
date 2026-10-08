import Order from "../models/Order.js";
import { findOrderByPublicIdentifier } from "../utils/orderLookup.js";
import { safeEqual } from "../utils/security.js";
import {
  checkServiceability,
  createShiprocketOrder,
  generateAWB,
  generateShippingLabel,
  trackShipment as trackShiprocketShipment,
} from "../services/shiprocketService.js";
import {
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
  sendReviewRequestEmail,
} from "../services/emailService.js";

/**
 * 1. Check Pincode Delivery Serviceability (Public)
 */
export const checkPincode = async (req, res) => {
  const { pincode, weight = 0.5, cod = 0 } = req.body;

  if (!pincode || String(pincode).trim().length !== 6 || isNaN(pincode)) {
    return res.status(400).json({ message: "Please provide a valid 6-digit Indian pincode" });
  }

  try {
    const result = await checkServiceability({
      deliveryPincode: pincode,
      weight,
      cod,
    });
    return res.json(result);
  } catch (err) {
    console.error("Pincode serviceability check failed:", err);
    return res.status(500).json({ message: "Unable to check pincode serviceability at the moment" });
  }
};

/**
 * 2. Track Shipment & Order Live Status (Public)
 */
export const trackOrderShipment = async (req, res) => {
  const { identifier } = req.params;
  const cleanId = String(identifier || "").trim();

  if (!cleanId) {
    return res.status(400).json({ message: "Please provide an Order ID or AWB Tracking Number" });
  }

  try {
    const order = await findOrderByPublicIdentifier(cleanId);

    // Call Shiprocket tracking
    const trackingQuery = order?.awbCode || order?.trackingNumber || cleanId;
    const shiprocketData = await trackShiprocketShipment(trackingQuery);

    if (!order && !shiprocketData?.success) {
      return res.status(404).json({ message: "No active shipment found with the provided identifier" });
    }

    // Build timeline milestones
    const statusSteps = [
      { key: "confirmed", label: "Order Confirmed", desc: "Payment verified & order booked" },
      { key: "processing", label: "Artisan Crafting", desc: "Your 3D keepsake is being handcrafted" },
      { key: "shipped", label: "Handed to Shiprocket", desc: "Packed in satin ribbon box & dispatched" },
      { key: "delivered", label: "Delivered", desc: "Safely received & unwrapped" },
    ];

    let currentStep = 1;
    const currentStatus = order?.status || "shipped";
    if (currentStatus === "processing") currentStep = 2;
    else if (currentStatus === "shipped") currentStep = 3;
    else if (currentStatus === "delivered") currentStep = 4;
    else if (currentStatus === "cancelled") currentStep = 0;

    return res.json({
      success: true,
      order: order
        ? {
            id: order._id,
            shortId: order._id.toString().slice(-6).toUpperCase(),
            createdAt: order.createdAt,
            status: order.status,
            currentStep,
            statusSteps,
            courierPartner: order.courierName || order.courierPartner || "BlueDart Express (Shiprocket)",
            trackingNumber: order.awbCode || order.trackingNumber,
            awbCode: order.awbCode,
            estimatedDelivery: order.estimatedDelivery,
            deliverySlot: order.deliverySlot,
            // Public endpoint: never expose street address or phone number
            shippingAddress: {
              name: order.shippingAddress?.name,
              city: order.shippingAddress?.city,
              state: order.shippingAddress?.state,
              postalCode: order.shippingAddress?.postalCode,
            },
            totalPrice: order.totalPrice,
            items: (order.items || []).map((i) => ({
              name: i.name,
              image: i.image,
              quantity: i.quantity,
              price: i.price,
            })),
          }
        : null,
      shiprocketTracking: shiprocketData?.tracking_data || null,
    });
  } catch (err) {
    console.error("Tracking query error:", err);
    return res.status(500).json({ message: "Error tracking shipment status" });
  }
};

/**
 * 3. Create Shiprocket Shipment & Generate AWB (Admin)
 */
export const createShipment = async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Order.findById(orderId).populate("user", "name email");
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Step 1: Create Order in Shiprocket
    const srOrderResult = await createShiprocketOrder(order);

    // Step 2: Generate AWB
    const awbResult = await generateAWB(srOrderResult.shipment_id);

    // Step 3: Generate Shipping Label
    const labelResult = await generateShippingLabel(srOrderResult.shipment_id);

    // Update MongoDB Order
    order.shiprocketOrderId = String(srOrderResult.order_id);
    order.shiprocketShipmentId = String(srOrderResult.shipment_id);
    order.awbCode = awbResult.awb_code;
    order.trackingNumber = awbResult.awb_code;
    order.courierName = awbResult.courier_name;
    order.courierPartner = awbResult.courier_name;
    order.shippingLabelUrl = labelResult.label_url;
    order.status = "shipped";
    order.shipmentStatus = "AWB_ASSIGNED";

    await order.save();

    // Dispatch Order Shipped Email
    sendOrderShippedEmail({
      order,
      userEmail: order.user?.email || order.shippingAddress?.email,
      userName: order.user?.name || order.shippingAddress?.name,
    }).catch((err) => console.error("[ShippingController] Error sending shipped email:", err));

    return res.json({
      success: true,
      message: "Shiprocket shipment created and AWB assigned successfully",
      order,
    });
  } catch (err) {
    console.error("Create shipment error:", err);
    return res.status(500).json({ message: err.message || "Failed to create Shiprocket shipment" });
  }
};

/**
 * 4. Fetch Shipping Label PDF (Admin)
 */
export const getShippingLabelPdf = async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.shippingLabelUrl) {
      return res.json({ success: true, labelUrl: order.shippingLabelUrl });
    }

    if (order.shiprocketShipmentId) {
      const result = await generateShippingLabel(order.shiprocketShipmentId);
      order.shippingLabelUrl = result.label_url;
      await order.save();
      return res.json({ success: true, labelUrl: result.label_url });
    }

    return res.status(400).json({ message: "Shipment has not been created yet in Shiprocket" });
  } catch (err) {
    console.error("Fetch label error:", err);
    return res.status(500).json({ message: "Failed to generate shipping label" });
  }
};

/**
 * 5. Shiprocket Live Status Webhook Receiver (Public)
 */
export const handleWebhook = async (req, res) => {
  // Shiprocket sends the token configured in its webhook settings as the x-api-key header
  const expectedToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!expectedToken) {
    console.error("[Webhook] SHIPROCKET_WEBHOOK_TOKEN is not set — rejecting webhook");
    return res.status(503).json({ message: "Webhook not configured" });
  }
  if (!safeEqual(req.headers["x-api-key"], expectedToken)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { awb, current_status, order_id, courier_name } = req.body;

  try {
    const cleanAwb = String(awb || "").trim();
    if (!cleanAwb && !order_id) {
      return res.status(400).json({ message: "Invalid webhook payload" });
    }

    const lookup = [];
    if (cleanAwb) lookup.push({ awbCode: cleanAwb }, { trackingNumber: cleanAwb });
    if (order_id) lookup.push({ shiprocketOrderId: String(order_id) });
    const order = await Order.findOne({ $or: lookup }).populate("user", "name email");

    if (order) {
      const prevStatus = order.status;
      const statusUpper = String(current_status || "").toUpperCase();

      if (statusUpper.includes("DELIVERED")) {
        order.status = "delivered";
        order.shipmentStatus = "DELIVERED";
      } else if (statusUpper.includes("OUT FOR DELIVERY")) {
        order.status = "shipped";
        order.shipmentStatus = "OUT_FOR_DELIVERY";
      } else if (statusUpper.includes("IN TRANSIT") || statusUpper.includes("PICKED UP")) {
        order.status = "shipped";
        order.shipmentStatus = "IN_TRANSIT";
      }

      if (courier_name) order.courierName = courier_name;
      await order.save();
      console.log(`Updated Order ${order._id} status to ${order.status} via Shiprocket webhook`);

      // Trigger Delivered & Review emails if transitioned to delivered
      if (order.status === "delivered" && prevStatus !== "delivered") {
        sendOrderDeliveredEmail({
          order,
          userEmail: order.user?.email || order.shippingAddress?.email,
          userName: order.user?.name || order.shippingAddress?.name,
        }).catch((e) => console.error("[Webhook] Error sending delivered email:", e));

        sendReviewRequestEmail({
          order,
          userEmail: order.user?.email || order.shippingAddress?.email,
          userName: order.user?.name || order.shippingAddress?.name,
        }).catch((e) => console.error("[Webhook] Error sending review email:", e));
      }
    }

    return res.json({ success: true, received: true });
  } catch (err) {
    console.error("Shiprocket webhook error:", err);
    return res.status(500).json({ message: "Webhook processing error" });
  }
};
