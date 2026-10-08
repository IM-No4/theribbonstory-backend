import crypto from "crypto";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Coupon from "../models/Coupon.js";
import { computeOrderPricing, PricingError } from "./pricingService.js";
import { sendOrderConfirmationEmail } from "./emailService.js";
import { alertNewOrder, checkLowStock } from "./studioAlerts.js";
import Reference3D from "../models/Reference3D.js";
import { completeReferencePack, resolveUploadedImagePath } from "./gemini3dAgent.js";

/** Unpaid online orders are deleted after this long (customer abandoned payment) */
export const PAYMENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const PREVIEW_READY_STATES = ["preview_ready", "processing_multiview", "completed"];
const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : undefined);
/** Only images we host may be stored on orders (never data: URLs or third-party links) */
const hostedImage = (value) => (typeof value === "string" && /^\/(uploads|images)\/[\w./-]+$/.test(value) ? value : undefined);

/**
 * Personalisation for each order item. For 3D keepsakes the customer's
 * approved preview is verified against its preview session and becomes the
 * design of record: the image that is turned into the 3D model and printed.
 */
const attachCustomizations = async (orderItems, cartItems, user) => {
  for (let i = 0; i < orderItems.length; i += 1) {
    const sent = cartItems[i]?.customization || {};
    const customization = {
      photoUrl: hostedImage(sent.photoUrl),
      note: text(sent.note, 1000),
      customName: text(sent.customName, 100),
      customDate: text(sent.customDate, 50),
      size: text(sent.size, 100),
    };

    const sessionId = text(sent.reference3D?.sessionId, 100);
    if (sessionId) {
      const session = await Reference3D.findOne({ sessionId });
      const ownedByOther = session?.userId && String(session.userId) !== String(user._id);
      if (!session || ownedByOther || !session.previewIsReal || !PREVIEW_READY_STATES.includes(session.status)) {
        throw new PricingError("Your 3D preview has expired. Please open the keepsake and upload your photo again.");
      }
      // The customer may have approved an earlier attempt: accept any generated
      // (PNG, never a placeholder SVG) front view of THIS session, defaulting to the latest
      const folder = `/uploads/3d_references/${session.storageKey}/`;
      const requested = hostedImage(sent.reference3D?.approvedPreview);
      const approvedPreview =
        requested && requested.startsWith(`${folder}front-`) && requested.endsWith(".png") && resolveUploadedImagePath(requested)
          ? requested
          : session.views.front.url;

      customization.photoUrl = session.originalImage.url;
      customization.reference3D = { sessionId, approvedPreview, approvedAt: new Date(), status: "approved" };
      orderItems[i].image = approvedPreview;
      if (!session.userId) await Reference3D.updateOne({ _id: session._id, userId: null }, { $set: { userId: user._id } });
    } else if (!hostedImage(orderItems[i].image)) {
      orderItems[i].image = undefined;
    }

    orderItems[i].customization = Object.fromEntries(Object.entries(customization).filter(([, v]) => v !== undefined));
  }
};

/**
 * Build the 3D reference pack (side and back views) for each approved
 * design once an order is confirmed. Runs in the background.
 */
export const startReferencePacks = (order) => {
  const refs = (order.items || []).map((i) => i.customization?.reference3D).filter((r) => r?.sessionId && r.approvedPreview);
  if (refs.length === 0) return;
  (async () => {
    for (const ref of refs) {
      try {
        await completeReferencePack({
          sessionId: ref.sessionId,
          approvedFrontPath: resolveUploadedImagePath(ref.approvedPreview),
          orderId: order._id,
        });
      } catch (err) {
        console.error(`[OrderService] 3D reference pack failed for order ${order._id}:`, err.message);
      }
    }
  })();
};

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
  await attachCustomizations(orderItems, items, user);

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
  alertNewOrder(order);
  checkLowStock(order.items);
  startReferencePacks(order);
  return { order, newlyPaid: true };
};
