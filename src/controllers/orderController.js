import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import { verifyRazorpayPaymentResult } from "./paymentController.js";
import {
  buildOrderFields,
  reserveStock,
  restoreStock,
  consumeCoupon,
  sendConfirmation,
  markOrderPaid,
  startReferencePacks,
} from "../services/orderService.js";
import { isObjectId } from "../utils/security.js";
import { alertNewOrder, alertCancellation, checkLowStock } from "../services/studioAlerts.js";
import { findOrderByPublicIdentifier } from "../utils/orderLookup.js";
import { sendRefundNotificationEmail } from "../services/emailService.js";
import { notifyStatusChange } from "../services/orderNotifications.js";
import { salesReport } from "../services/salesReport.js";
import { assignInvoiceNumber, issueInvoice, renderInvoicePdf } from "../services/invoiceService.js";

/**
 * Cash-on-delivery orders. Online (Razorpay) orders are created by
 * POST /payments/razorpay/order and confirmed via confirmOrderPayment or
 * the Razorpay webhook.
 */
export const createOrder = async (req, res) => {
  if (req.body.paymentMethod !== "cod") {
    return res.status(400).json({
      message: "Online payments start at /payments/razorpay/order. Please refresh the page and try again.",
    });
  }

  const { fields, coupon } = await buildOrderFields(req.body, req.user);

  await reserveStock(fields.items);
  let order;
  try {
    if (coupon && !(await consumeCoupon(coupon._id))) {
      return res.status(400).json({ message: `Coupon "${coupon.code}" usage limit reached` });
    }
    order = await Order.create({
      ...fields,
      paymentMethod: "cod",
      isPaid: false,
      status: "confirmed",
      stockDeducted: true,
    });
  } finally {
    // Give stock back if the order was not created
    if (!order) {
      await Promise.all(
        fields.items
          .filter((i) => i.fromCatalog)
          .map((i) => Product.updateOne({ _id: i.product }, { $inc: { stock: i.quantity } }))
      );
    }
  }

  sendConfirmation(order, req.user);
  alertNewOrder({ ...(order.toObject?.() ?? order), user: req.user });
  checkLowStock(order.items);
  startReferencePacks(order);
  issueInvoice(order);
  return res.status(201).json({ order });
};

/**
 * Browser-side confirmation after Razorpay checkout. The webhook confirms
 * the same order independently, so a closed tab never loses a paid order.
 */
export const confirmOrderPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid order" });

  const order = await Order.findById(req.params.id);
  if (!order || String(order.user) !== String(req.user._id)) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (order.paymentMethod !== "razorpay" || order.paymentResult?.razorpayOrderId !== razorpay_order_id) {
    return res.status(400).json({ message: "Payment does not belong to this order" });
  }
  if (order.isPaid) return res.json({ order });

  const payment = await verifyRazorpayPaymentResult(
    { razorpayOrderId: razorpay_order_id, razorpayPaymentId: razorpay_payment_id, razorpaySignature: razorpay_signature },
    order.totalPrice
  );
  const result = await markOrderPaid({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
    amountPaise: payment.amount,
  });
  return res.json({ order: result.order });
};

export const getMyOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user._id, awaitingPayment: { $ne: true } }).sort({ createdAt: -1 });
  return res.json({ orders });
};

export const getOrderById = async (req, res) => {
  const order = await Order.findById(req.params.id).populate("user", "name email");
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (String(order.user?._id || order.user) !== String(req.user._id) && req.user.role !== "admin") {
    return res.status(403).json({ message: "Not authorized to view this order" });
  }
  if (req.user.role === "admin") {
    const [withFiles] = await withPrintFiles([order]);
    return res.json({ order: withFiles });
  }
  return res.json({ order });
};

/** GST invoice PDF for the customer who placed the order, or an admin */
export const getOrderInvoice = async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid order" });
  const order = await Order.findById(req.params.id).populate("user", "name email");
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (String(order.user?._id || order.user) !== String(req.user._id) && req.user.role !== "admin") {
    return res.status(403).json({ message: "Not authorized to view this order" });
  }
  // Orders from before invoices existed get their number on first download
  if (!(await assignInvoiceNumber(order))?.number) {
    return res.status(400).json({ message: "The invoice will be available once your order is confirmed." });
  }
  const pdf = await renderInvoicePdf(order);
  const filename = `invoice-${order.invoice.number.replace(/\//g, "-")}.pdf`;
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  });
  return res.send(pdf);
};

// Public Order Tracking
export const trackOrder = async (req, res) => {
  const { identifier } = req.params;

  const order = await findOrderByPublicIdentifier(identifier);

  if (!order) {
    return res.status(404).json({ message: "No order found with the provided Order ID or Tracking Number" });
  }

  // Construct timeline step info
  const statusSteps = [
    { key: "confirmed", label: "Order Confirmed", desc: "Payment verified and order booked" },
    { key: "processing", label: "Artisan Crafting & Printing", desc: "Your bespoke keepsake is being hand-finished" },
    { key: "shipped", label: "Packed & In Transit", desc: "Dispatched with luxury ribbon packaging" },
    { key: "delivered", label: "Delivered", desc: "Safely received and unwrapped" },
  ];

  let currentStep = 1;
  if (order.status === "processing") currentStep = 2;
  else if (order.status === "shipped") currentStep = 3;
  else if (order.status === "delivered") currentStep = 4;
  else if (order.status === "cancelled") currentStep = 0;

  return res.json({
    order: {
      id: order._id,
      orderNumber: `#${order._id.toString().slice(-6).toUpperCase()}`,
      status: order.status,
      currentStep,
      statusSteps,
      createdAt: order.createdAt,
      items: (order.items || []).map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      itemsPrice: order.itemsPrice,
      shippingPrice: order.shippingPrice,
      discountPrice: order.discountPrice,
      totalPrice: order.totalPrice,
      shippingAddress: {
        name: order.shippingAddress?.name,
        city: order.shippingAddress?.city,
        state: order.shippingAddress?.state,
        postalCode: order.shippingAddress?.postalCode,
      },
      trackingNumber: order.trackingNumber || `TRS-EXP-${order._id.toString().slice(-6).toUpperCase()}`,
      courierPartner: order.courierPartner || "BlueDart Express",
      estimatedDelivery: order.estimatedDelivery || new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    },
  });
};

/**
 * Admin views: mark each order item whose product has a production print
 * file attached, so the studio can download it from the order.
 */
const withPrintFiles = async (orders) => {
  const productIds = [
    ...new Set(
      orders.flatMap((o) => (o.items || []).filter((i) => i.fromCatalog !== false && i.product).map((i) => String(i.product)))
    ),
  ];
  const printable = productIds.length
    ? await Product.find({ _id: { $in: productIds }, "printFile.filename": { $exists: true } }).select("+printFile")
    : [];
  const files = new Map(
    printable.map((p) => [String(p._id), { originalName: p.printFile.originalName, size: p.printFile.size }])
  );
  return orders.map((o) => {
    const order = typeof o.toObject === "function" ? o.toObject() : o;
    order.items = (order.items || []).map((i) => ({
      ...i,
      printFile: i.fromCatalog !== false && i.product ? files.get(String(i.product)) || null : null,
    }));
    return order;
  });
};

// Admin Controllers
export const getAdminOrders = async (req, res) => {
  const { status, search } = req.query;
  const filter = { awaitingPayment: { $ne: true } };
  if (status && status !== "all") filter.status = status;

  let query = Order.find(filter).populate("user", "name email").sort({ createdAt: -1 });
  const orders = await query.exec();

  let results = orders;
  if (search) {
    const s = search.toLowerCase();
    results = orders.filter(
      (o) =>
        o._id.toString().includes(s) ||
        o.user?.name?.toLowerCase().includes(s) ||
        o.user?.email?.toLowerCase().includes(s) ||
        o.shippingAddress?.city?.toLowerCase().includes(s) ||
        o.trackingNumber?.toLowerCase().includes(s)
    );
  }

  return res.json({ orders: await withPrintFiles(results), count: results.length });
};

export const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status, isPaid, trackingNumber, courierPartner, estimatedDelivery } = req.body;

  const order = await Order.findById(id).populate("user", "name email");
  if (!order) return res.status(404).json({ message: "Order not found" });

  const oldStatus = order.status;
  if (status) order.status = status;
  if (isPaid !== undefined) {
    order.isPaid = Boolean(isPaid);
    if (order.isPaid && !order.paidAt) order.paidAt = new Date();
  }
  if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
  if (courierPartner !== undefined) order.courierPartner = courierPartner;
  if (estimatedDelivery !== undefined) order.estimatedDelivery = new Date(estimatedDelivery);

  await order.save();
  if (status === "cancelled" && oldStatus !== "cancelled") await restoreStock(order._id);

  // Shipped / delivered emails to the customer (each sent once)
  notifyStatusChange(order, oldStatus);

  return res.json({ order, message: `Order status updated to ${order.status}` });
};

/** Admin sales dashboard: ?range=today|7d|30d */
export const getSalesReport = async (req, res) => {
  res.json(await salesReport(String(req.query.range || "7d")));
};

export const getAdminStats = async (req, res) => {
  const [totalProducts, totalCategories, orders, lowStockProducts] = await Promise.all([
    Product.countDocuments(),
    Category.countDocuments(),
    Order.find({ awaitingPayment: { $ne: true } }).sort({ createdAt: -1 }),
    Product.find({ stock: { $lte: 10 } }).limit(5),
  ]);

  const totalOrders = orders.length;
  // Cancelled and refunded orders aren't revenue
  const totalRevenue = orders
    .filter((o) => o.status !== "cancelled" && !(o.isRefunded && o.refundStatus === "refunded"))
    .reduce((sum, o) => sum + (o.totalPrice || 0), 0);
  const pendingOrders = orders.filter((o) => o.status === "pending" || o.status === "confirmed").length;
  const deliveredOrders = orders.filter((o) => o.status === "delivered").length;
  const recentOrders = orders.slice(0, 5);

  return res.json({
    stats: {
      totalRevenue,
      totalOrders,
      pendingOrders,
      deliveredOrders,
      totalProducts,
      totalCategories,
      lowStockCount: lowStockProducts.length,
    },
    recentOrders,
    lowStockProducts,
  });
};

/**
 * 1. Admin Issue Full or Partial Refund (Razorpay & COD)
 */
export const issueOrderRefund = async (req, res) => {
  const { id } = req.params;
  const { amount, reason } = req.body;

  const order = await Order.findById(id).populate("user", "name email");
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.isRefunded && order.refundStatus === "refunded") {
    return res.status(400).json({ message: "This order has already been refunded" });
  }

  const refundAmt = Number(amount) > 0 ? Number(amount) : order.totalPrice;
  if (refundAmt > order.totalPrice) {
    return res.status(400).json({ message: `Refund cannot exceed the order total of ₹${order.totalPrice}` });
  }
  const refundNotes = {
    orderId: order._id.toString(),
    customerEmail: order.user?.email || "customer@theribbonstory.com",
    reason: reason || "Customer requested refund",
  };

  let refundResult = null;

  // If order was paid online via Razorpay, process payment gateway refund
  if (order.isPaid && order.paymentMethod === "razorpay" && order.paymentResult?.razorpayPaymentId) {
    const { executeRazorpayRefund } = await import("./paymentController.js");
    refundResult = await executeRazorpayRefund({
      paymentId: order.paymentResult.razorpayPaymentId,
      amount: refundAmt,
      notes: refundNotes,
    });
  } else {
    // COD or Manual Store Credit Refund
    refundResult = {
      refundId: `manual_rfnd_${Date.now()}`,
      amount: refundAmt,
      status: "processed",
    };
  }

  // Update order refund attributes
  order.isRefunded = true;
  order.refundStatus = "refunded";
  order.refundAmount = refundAmt;
  order.refundId = refundResult.refundId || `rfnd_${Date.now()}`;
  order.refundReason = reason || "Refund processed by Admin";
  order.refundedAt = new Date();
  order.status = "cancelled";

  await order.save();
  await restoreStock(order._id);

  // Dispatch Luxury Refund Notification Email
  sendRefundNotificationEmail({
    order,
    userEmail: order.user?.email || order.shippingAddress?.email,
    refundAmount: refundAmt,
    refundId: order.refundId,
    reason: order.refundReason,
  }).catch((err) => console.error("[OrderController] Failed to dispatch refund email:", err));

  return res.json({
    success: true,
    message: `Refund of ₹${refundAmt} processed successfully via ${order.paymentMethod === "razorpay" ? "Razorpay" : "Store Credit / Bank Transfer"}`,
    order,
    refund: refundResult,
  });
};

/**
 * 2. Customer Request Order Cancellation & Refund
 */
export const requestOrderCancellation = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const order = await Order.findById(id).populate("user", "name email");
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (String(order.user?._id || order.user) !== String(req.user._id) && req.user.role !== "admin") {
    return res.status(403).json({ message: "Not authorized to cancel this order" });
  }

  if (order.status === "cancelled" || order.status === "delivered") {
    return res.status(400).json({ message: `Order cannot be cancelled because it is already ${order.status}` });
  }

  // If order is still in confirmed/pending stage and prepaid, auto-process instant refund
  if ((order.status === "confirmed" || order.status === "pending") && order.isPaid && order.paymentResult?.razorpayPaymentId) {
    const { executeRazorpayRefund } = await import("./paymentController.js");
    const refundResult = await executeRazorpayRefund({
      paymentId: order.paymentResult.razorpayPaymentId,
      amount: order.totalPrice,
      notes: { orderId: order._id.toString(), reason: reason || "Customer self-cancellation" },
    });

    order.isRefunded = true;
    order.refundStatus = "refunded";
    order.refundAmount = order.totalPrice;
    order.refundId = refundResult.refundId;
    order.refundReason = reason || "Customer cancelled order";
    order.refundedAt = new Date();
    order.status = "cancelled";
    order.cancellationReason = reason || "Customer cancelled order";
    order.cancelledAt = new Date();

    await order.save();
    await restoreStock(order._id);

    // Dispatch Refund Email
    sendRefundNotificationEmail({
      order,
      userEmail: order.user?.email || order.shippingAddress?.email,
      refundAmount: order.totalPrice,
      refundId: order.refundId,
      reason: order.refundReason,
    }).catch((err) => console.error("[OrderController] Failed to dispatch refund email:", err));
    alertCancellation(order, { autoRefunded: true });

    return res.json({
      success: true,
      message: "Order cancelled and 100% refund has been processed back to your payment account.",
      order,
    });
  }

  // If order is already in processing / bespoke crafting, submit cancellation request for artisan review
  order.refundStatus = "requested";
  order.cancellationReason = reason || "Cancellation requested by customer";
  order.cancelledAt = new Date();
  await order.save();
  alertCancellation(order, { autoRefunded: false });

  return res.json({
    success: true,
    message: "Cancellation & refund request submitted to our artisan studio. We will review and process within 2 hours.",
    order,
  });
};

/**
 * 3. Get Order Refund Status
 */
export const getOrderRefundStatus = async (req, res) => {
  const { id } = req.params;
  const order = await Order.findById(id);
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (String(order.user) !== String(req.user._id) && req.user.role !== "admin") {
    return res.status(403).json({ message: "Not authorized to view this order" });
  }

  return res.json({
    isRefunded: order.isRefunded,
    refundStatus: order.refundStatus,
    refundAmount: order.refundAmount,
    refundId: order.refundId,
    refundReason: order.refundReason,
    refundedAt: order.refundedAt,
    cancellationReason: order.cancellationReason,
  });
};

