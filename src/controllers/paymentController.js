import Razorpay from "razorpay";
import crypto from "crypto";
import { computeOrderPricing } from "../services/pricingService.js";
import { safeEqual } from "../utils/security.js";

const getRazorpayInstance = () => {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.includes("xxxx") || !RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
};

export const createRazorpayOrder = async (req, res) => {
  const instance = getRazorpayInstance();
  if (!instance) {
    return res.status(503).json({
      message:
        "Payment gateway not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env to enable checkout.",
    });
  }

  // Amount is always computed server-side from the cart, never taken from the client
  const { items, couponCode, deliverySlot } = req.body;
  const pricing = await computeOrderPricing({ items, couponCode, deliverySlot });
  if (pricing.totalPrice <= 0) return res.status(400).json({ message: "Invalid order amount" });

  const order = await instance.orders.create({
    amount: Math.round(pricing.totalPrice * 100),
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
    notes: { userId: String(req.user._id) },
  });

  return res.status(201).json({
    order,
    keyId: process.env.RAZORPAY_KEY_ID,
    pricing: {
      itemsPrice: pricing.itemsPrice,
      shippingPrice: pricing.shippingPrice,
      discountPrice: pricing.discountPrice,
      totalPrice: pricing.totalPrice,
    },
  });
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

  const instance = getRazorpayInstance();
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
  const instance = getRazorpayInstance();

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

