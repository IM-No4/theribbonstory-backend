import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Coupon from "../models/Coupon.js";
import {
  sendOrderConfirmationEmail,
  sendRefundNotificationEmail,
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
  sendReviewRequestEmail,
} from "../services/emailService.js";

export const createOrder = async (req, res) => {
  const {
    items,
    shippingAddress,
    paymentMethod,
    paymentResult,
    couponCode,
    discountPrice,
    giftOptions,
    scheduledDeliveryDate,
    deliverySlot,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Your cart is empty" });
  }
  if (!shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.postalCode) {
    return res.status(400).json({ message: "A complete shipping address is required" });
  }

  const productIds = items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } });
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const orderItems = items.map((item) => {
    const product = productMap.get(String(item.productId));
    if (!product) throw Object.assign(new Error(`Product ${item.productId} no longer exists`), { statusCode: 400 });

    const optionsTotal = (item.selectedOptions || []).reduce((sum, o) => sum + (Number(o.priceDelta) || 0), 0);
    return {
      product: product._id,
      name: product.name,
      image: product.images?.[0],
      price: product.price + optionsTotal,
      quantity: Math.max(1, Number(item.quantity) || 1),
      selectedOptions: item.selectedOptions || [],
      customization: item.customization || {},
    };
  });

  const itemsPrice = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const isMidnight = deliverySlot?.toLowerCase().includes("midnight");
  const shippingPrice = (itemsPrice > 999 ? 0 : 79) + (isMidnight ? 199 : 0);
  const validDiscount = Math.max(0, Number(discountPrice) || 0);
  const totalPrice = Math.max(0, itemsPrice + shippingPrice - validDiscount);

  // If a valid coupon was used, increment usage counter
  if (couponCode) {
    await Coupon.findOneAndUpdate(
      { code: couponCode.trim().toUpperCase() },
      { $inc: { usedCount: 1 } }
    );
  }

  // Generate estimated delivery date (3-5 days from now or scheduled date)
  const estimatedDelivery = scheduledDeliveryDate ? new Date(scheduledDeliveryDate) : new Date();
  if (!scheduledDeliveryDate) {
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 4);
  }

  const order = await Order.create({
    user: req.user._id,
    items: orderItems,
    shippingAddress,
    itemsPrice,
    shippingPrice,
    discountPrice: validDiscount,
    couponCode: couponCode || "",
    totalPrice,
    paymentMethod,
    paymentResult,
    isPaid: paymentMethod === "razorpay" && !!paymentResult?.razorpayPaymentId,
    paidAt: paymentMethod === "razorpay" && paymentResult?.razorpayPaymentId ? new Date() : undefined,
    status: "confirmed",
    trackingNumber: `TRS-EXP-${Math.floor(100000 + Math.random() * 900000)}`,
    courierPartner: "BlueDart Express & Surface",
    estimatedDelivery,
    giftOptions: giftOptions || { isGift: false },
    scheduledDeliveryDate: scheduledDeliveryDate || "",
    deliverySlot: deliverySlot || "Standard Delivery (3-5 Days)",
  });

  // Asynchronously dispatch luxury branded Order Confirmation email
  sendOrderConfirmationEmail({
    order,
    userEmail: req.user?.email || shippingAddress?.email,
    userName: req.user?.name || shippingAddress?.name,
  }).catch((err) => console.error("[OrderController] Failed to dispatch order email:", err));

  return res.status(201).json({ order });
};

export const getMyOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  return res.json({ orders });
};

export const getOrderById = async (req, res) => {
  const order = await Order.findById(req.params.id).populate("user", "name email");
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (String(order.user?._id || order.user) !== String(req.user._id) && req.user.role !== "admin") {
    return res.status(403).json({ message: "Not authorized to view this order" });
  }
  return res.json({ order });
};

// Public Order Tracking
export const trackOrder = async (req, res) => {
  const { identifier } = req.params;
  const { query } = req.query; // phone or email for verification if provided

  let order = null;
  // If exact 24-char ObjectId
  if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
    order = await Order.findById(identifier).populate("user", "name email");
  } else {
    // Search by tracking number or last 6 characters
    order = await Order.findOne({
      $or: [
        { trackingNumber: { $regex: identifier, $options: "i" } },
        { _id: identifier },
      ],
    }).populate("user", "name email");
  }

  if (!order) {
    // Attempt fallback searching by ID suffix
    const allOrders = await Order.find().populate("user", "name email").sort({ createdAt: -1 }).limit(100);
    order = allOrders.find((o) => o._id.toString().endsWith(identifier.toLowerCase()));
  }

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
      items: order.items,
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

// Admin Controllers
export const getAdminOrders = async (req, res) => {
  const { status, search } = req.query;
  const filter = {};
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

  return res.json({ orders: results, count: results.length });
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

  // Dispatch Status Change Emails Asynchronously
  if (status && status !== oldStatus) {
    if (status === "shipped") {
      sendOrderShippedEmail({
        order,
        userEmail: order.user?.email || order.shippingAddress?.email,
        userName: order.user?.name || order.shippingAddress?.name,
      }).catch((err) => console.error("[OrderController] Failed to dispatch shipped email:", err));
    } else if (status === "delivered") {
      sendOrderDeliveredEmail({
        order,
        userEmail: order.user?.email || order.shippingAddress?.email,
        userName: order.user?.name || order.shippingAddress?.name,
      }).catch((err) => console.error("[OrderController] Failed to dispatch delivered email:", err));

      // Also trigger 5-star Review Request Email
      sendReviewRequestEmail({
        order,
        userEmail: order.user?.email || order.shippingAddress?.email,
        userName: order.user?.name || order.shippingAddress?.name,
      }).catch((err) => console.error("[OrderController] Failed to dispatch review email:", err));
    }
  }

  return res.json({ order, message: `Order status updated to ${order.status}` });
};

export const getAdminStats = async (req, res) => {
  const [totalProducts, totalCategories, orders, lowStockProducts] = await Promise.all([
    Product.countDocuments(),
    Category.countDocuments(),
    Order.find().sort({ createdAt: -1 }),
    Product.find({ stock: { $lte: 10 } }).limit(5),
  ]);

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
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

    // Dispatch Refund Email
    sendRefundNotificationEmail({
      order,
      userEmail: order.user?.email || order.shippingAddress?.email,
      refundAmount: order.totalPrice,
      refundId: order.refundId,
      reason: order.refundReason,
    }).catch((err) => console.error("[OrderController] Failed to dispatch refund email:", err));

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

