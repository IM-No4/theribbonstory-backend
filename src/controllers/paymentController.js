import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import { buildOrderFields, markOrderPaid, PAYMENT_WINDOW_MS } from "../services/orderService.js";
import { safeEqual } from "../utils/security.js";

// Wrapped in an object so tests can substitute a fake gateway
export const razorpayGateway = {
  getInstance: () => {
    const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
    if (!RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.includes("xxxx") || !RAZORPAY_KEY_SECRET) {
      return null;
    }
    return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  },
};

/**
 * Start an online checkout: price the cart on the server, save the order as
 * awaiting payment, and open a Razorpay order for exactly that amount.
 */
export const createRazorpayOrder = async (req, res) => {
  const instance = razorpayGateway.getInstance();
  if (!instance) {
    return res.status(503).json({
      message:
        "Payment gateway not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env to enable checkout.",
    });
  }

  const { fields } = await buildOrderFields(req.body, req.user);
  if (fields.totalPrice <= 0) return res.status(400).json({ message: "Invalid order amount" });

  const orderId = new mongoose.Types.ObjectId();
  const rzpOrder = await instance.orders.create({
    amount: Math.round(fields.totalPrice * 100),
    currency: "INR",
    receipt: `order_${orderId}`,
    notes: { orderId: String(orderId), userId: String(req.user._id) },
  });

  await Order.create({
    _id: orderId,
    ...fields,
    paymentMethod: "razorpay",
    isPaid: false,
    status: "pending",
    awaitingPayment: true,
    paymentExpiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS),
    paymentResult: { razorpayOrderId: rzpOrder.id },
  });

  return res.status(201).json({
    order: rzpOrder,
    orderId,
    keyId: process.env.RAZORPAY_KEY_ID,
    pricing: {
      itemsPrice: fields.itemsPrice,
      shippingPrice: fields.shippingPrice,
      discountPrice: fields.discountPrice,
      totalPrice: fields.totalPrice,
    },
  });
};

/**
 * Razorpay webhook (payment.captured / order.paid). Confirms the order even
 * when the customer's browser never came back after paying.
 * Configure in Razorpay Dashboard > Settings > Webhooks with
 * RAZORPAY_WEBHOOK_SECRET as the secret.
 */
export const razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[RazorpayWebhook] RAZORPAY_WEBHOOK_SECRET is not set — rejecting webhook");
    return res.status(503).json({ message: "Webhook not configured" });
  }
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody || "").digest("hex");
  if (!req.rawBody || !safeEqual(expected, req.headers["x-razorpay-signature"])) {
    return res.status(401).json({ message: "Invalid signature" });
  }

  const { event, payload } = req.body || {};
  if (!["payment.captured", "order.paid"].includes(event)) return res.json({ received: true, ignored: event });

  const payment = payload?.payment?.entity;
  if (!payment?.order_id || !payment?.id) return res.json({ received: true, ignored: "no payment" });

  try {
    const result = await markOrderPaid({
      razorpayOrderId: payment.order_id,
      razorpayPaymentId: payment.id,
      amountPaise: payment.amount,
    });
    if (!result) {
      console.warn(`[RazorpayWebhook] No order for Razorpay order ${payment.order_id} (payment ${payment.id})`);
      return res.json({ received: true, matched: false });
    }
    return res.json({ received: true, matched: true, newlyPaid: result.newlyPaid });
  } catch (err) {
    // Acknowledge so Razorpay stops retrying; the mismatch needs a human
    console.error(`[RazorpayWebhook] Could not confirm payment ${payment.id}:`, err.message);
    return res.json({ received: true, error: err.message });
  }
};

const isValidRazorpaySignature = ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  return safeEqual(expected, razorpaySignature);
};

/**
 * Verify a Razorpay checkout result end-to-end: signature, payment state,
 * that the payment belongs to the order, and that the paid amount matches.
 * Throws with statusCode on failure.
 */
export const verifyRazorpayPaymentResult = async (paymentResult, expectedTotal) => {
  const fail = (message) => {
    const err = new Error(message);
    err.statusCode = 400;
    return err;
  };

  const instance = razorpayGateway.getInstance();
  if (!instance) {
    const err = new Error("Payment gateway not configured");
    err.statusCode = 503;
    throw err;
  }
  if (!isValidRazorpaySignature(paymentResult || {})) throw fail("Payment signature verification failed");

  const payment = await instance.payments.fetch(paymentResult.razorpayPaymentId);
  if (payment.order_id !== paymentResult.razorpayOrderId) throw fail("Payment does not belong to this order");
  if (!["captured", "authorized"].includes(payment.status)) throw fail("Payment has not been completed");
  if (payment.currency !== "INR" || Number(payment.amount) !== Math.round(expectedTotal * 100)) {
    throw fail("Paid amount does not match the order total. Please contact support.");
  }
  return payment;
};

export const verifyRazorpayPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const isValid = isValidRazorpaySignature({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  });
  return res.json({ valid: isValid });
};

/**
 * Execute a Full or Partial Refund via Razorpay
 */
export const executeRazorpayRefund = async ({ paymentId, amount, notes = {} }) => {
  const instance = razorpayGateway.getInstance();

  if (!paymentId) throw new Error("Missing Razorpay payment id for refund");

  // Mock refunds only for local development without gateway keys
  if (!instance) {
    if (process.env.NODE_ENV === "production") throw new Error("Payment gateway not configured");
    const mockRefundId = `rfnd_${Math.random().toString(36).substring(2, 16)}`;
    return {
      success: true,
      refundId: mockRefundId,
      amount: amount,
      status: "processed",
      created_at: Math.floor(Date.now() / 1000),
      notes,
    };
  }

  try {
    const refundPayload = {
      amount: Math.round(amount * 100), // convert to paise
      speed: "optimum",
      notes,
    };

    const refund = await instance.payments.refund(paymentId, refundPayload);
    return {
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status || "processed",
      created_at: refund.created_at,
    };
  } catch (err) {
    console.error("Razorpay refund error:", err);
    throw new Error(err.error?.description || err.message || "Failed to process refund via Razorpay");
  }
};

