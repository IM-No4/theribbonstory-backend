import crypto from "crypto";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Coupon from "../models/Coupon.js";
import { computeOrderPricing, PricingError } from "./pricingService.js";
import { sendOrderConfirmationEmail } from "./emailService.js";

/** Unpaid online orders are deleted after this long (customer abandoned payment) */
export const PAYMENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Validate the checkout payload and build the order document fields with
 * server-side pricing. Shared by COD orders and pending online orders.
 */
export const buildOrderFields = async (body, user) => {
  const { items, shippingAddress, couponCode, giftOptions, scheduledDeliveryDate, deliverySlot, courierPartner } =
    body || {};

  if (!Array.isArray(items) || items.length === 0) throw new PricingError("Your cart is empty");
  if (!shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.postalCode) {
    throw new PricingError("A complete shipping address is required");
  }

  const { orderItems, itemsPrice, shippingPrice, discountPrice, totalPrice, coupon } = await computeOrderPricing({
    items,
    couponCode,
    deliverySlot,
  });

  // Estimated delivery: scheduled date, or 4 days from now
  let estimatedDelivery = scheduledDeliveryDate ? new Date(scheduledDeliveryDate) : null;
  if (!estimatedDelivery || isNaN(estimatedDelivery)) {
    estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 4);
  }

  return {
    coupon,
    fields: {
      user: user._id,
      items: orderItems,
      shippingAddress,
      itemsPrice,
      shippingPrice,
      discountPrice,
      couponCode: coupon?.code || "",
      totalPrice,
      trackingNumber: `TRS-EXP-${crypto.randomInt(100000, 1000000)}`,
      courierPartner: typeof courierPartner === "string" ? courierPartner.slice(0, 100) : undefined,
      estimatedDelivery,
      giftOptions: giftOptions || { isGift: false },
      scheduledDeliveryDate: typeof scheduledDeliveryDate === "string" ? scheduledDeliveryDate : "",
      deliverySlot: typeof deliverySlot === "string" ? deliverySlot : "Standard Delivery (3-5 Days)",
    },
  };
};

/** Quantity per catalog product in an order (placeholder-linked items carry no stock) */
const stockLines = (items) => {
  const totals = new Map();
  for (const item of items || []) {
    if (!item.fromCatalog || !item.product) continue;
    const id = String(item.product);
    totals.set(id, (totals.get(id) || 0) + item.quantity);
  }
  return [...totals.entries()];
};

/**
 * Atomically take stock for an order, all-or-nothing: if any product has
 * run out, everything taken so far is put back and a 409 is thrown.
 */
export const reserveStock = async (items) => {
  const taken = [];
  for (const [productId, quantity] of stockLines(items)) {
    const result = await Product.updateOne(
      { _id: productId, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } }
    );
    if (result.modifiedCount !== 1) {
      await Promise.all(taken.map(([id, qty]) => Product.updateOne({ _id: id }, { $inc: { stock: qty } })));
      const product = await Product.findById(productId).select("name stock");
      const err = new Error(
        product
          ? `Sorry, only ${Math.max(0, product.stock)} of "${product.name}" left in stock`
          : "An item in your cart is no longer available"
      );
      err.statusCode = 409;
      throw err;
    }
    taken.push([productId, quantity]);
  }
};

/** Take stock for an order that is already paid: never refused, may go below zero for the team to see */
const deductPaidStock = (items) =>
  Promise.all(stockLines(items).map(([id, qty]) => Product.updateOne({ _id: id }, { $inc: { stock: -qty } })));

/**
 * Put an order's stock back exactly once (cancellations and refunds).
 * Only orders that took stock (stockDeducted) give it back.
 */
export const restoreStock = async (orderId) => {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, stockDeducted: true, stockRestored: { $ne: true } },
    { $set: { stockRestored: true } },
    { new: true }
  );
  if (!order) return false;
  await Promise.all(stockLines(order.items).map(([id, qty]) => Product.updateOne({ _id: id }, { $inc: { stock: qty } })));
  return true;
};

/** Count one use of the order's coupon, respecting its usage limit */
export const consumeCoupon = async (couponId) => {
  if (!couponId) return true;
  const updated = await Coupon.findOneAndUpdate(
    {
      _id: couponId,
      $or: [{ usageLimit: { $lte: 0 } }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
    },
    { $inc: { usedCount: 1 } }
  );
  return Boolean(updated);
};

export const sendConfirmation = (order, user) =>
  sendOrderConfirmationEmail({
    order,
    userEmail: user?.email || order.shippingAddress?.email,
    userName: user?.name || order.shippingAddress?.name,
  }).catch((err) => console.error("[OrderService] Failed to dispatch order email:", err));

/**
 * Confirm payment for a pending online order. Safe to call from both the
 * browser and the Razorpay webhook: the update only matches an unpaid
 * order, so exactly one caller confirms it and runs the side effects.
 * Returns { order, newlyPaid } or null when no such pending order exists.
 */
export const markOrderPaid = async ({ razorpayOrderId, razorpayPaymentId, razorpaySignature, amountPaise }) => {
  const pending = await Order.findOne({ "paymentResult.razorpayOrderId": razorpayOrderId });
  if (!pending) return null;
  if (pending.isPaid) return { order: pending, newlyPaid: false };

  if (Number(amountPaise) !== Math.round(pending.totalPrice * 100)) {
    const err = new Error("Paid amount does not match the order total. Please contact support.");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findOneAndUpdate(
    { _id: pending._id, isPaid: false },
    {
      $set: {
        isPaid: true,
        paidAt: new Date(),
        status: "confirmed",
        stockDeducted: true,
        "paymentResult.razorpayPaymentId": razorpayPaymentId,
        ...(razorpaySignature ? { "paymentResult.razorpaySignature": razorpaySignature } : {}),
      },
      $unset: { awaitingPayment: 1, paymentExpiresAt: 1 },
    },
    { new: true }
  ).populate("user", "name email");

  // Lost the race: the other caller already confirmed it
  if (!order) return { order: await Order.findById(pending._id), newlyPaid: false };

  await deductPaidStock(order.items);
  if (order.couponCode) {
    const coupon = await Coupon.findOne({ code: order.couponCode }).select("_id");
    await consumeCoupon(coupon?._id);
  }
  sendConfirmation(order, order.user);
  return { order, newlyPaid: true };
};
