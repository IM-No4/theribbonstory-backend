import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // true when `product` is the catalog product the customer chose (false for
    // hampers/keepsakes linked to a placeholder product)
    fromCatalog: { type: Boolean },
    name: String,
    image: String,
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, default: 1 },
    selectedOptions: [{ name: String, value: String, priceDelta: Number }],
    customization: {
      photoUrl: String,
      note: String,
      // Personalisation the customer typed in (previously dropped on save)
      customName: String,
      customDate: String,
      size: String,
      reference3D: {
        sessionId: String,
        // The exact preview image the customer approved: the design to print
        approvedPreview: String,
        approvedAt: Date,
        front: String,
        left: String,
        right: String,
        back: String,
        zipUrl: String,
        status: String,
        generatedAt: Date,
      },
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [orderItemSchema],
    shippingAddress: {
      name: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
      phone: String,
    },
    itemsPrice: { type: Number, required: true },
    shippingPrice: { type: Number, required: true, default: 0 },
    discountPrice: { type: Number, default: 0 },
    couponCode: { type: String, default: "" },
    totalPrice: { type: Number, required: true },
    paymentMethod: { type: String, enum: ["razorpay", "cod"], default: "razorpay" },
    paymentResult: {
      razorpayOrderId: String,
      razorpayPaymentId: String,
      razorpaySignature: String,
    },
    isPaid: { type: Boolean, default: false },
    paidAt: Date,
    status: {
      type: String,
      enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"],
      default: "confirmed",
    },
    trackingNumber: { type: String, default: "" },
    courierPartner: { type: String, default: "BlueDart Express (Shiprocket)" },
    estimatedDelivery: { type: Date },
    // Shiprocket Logistics Fields
    shiprocketOrderId: { type: String, default: "" },
    shiprocketShipmentId: { type: String, default: "" },
    awbCode: { type: String, default: "" },
    courierName: { type: String, default: "BlueDart Express" },
    shippingLabelUrl: { type: String, default: "" },
    shipmentStatus: { type: String, default: "PENDING" },
    // Refund & Cancellation Fields
    isRefunded: { type: Boolean, default: false },
    refundStatus: {
      type: String,
      enum: ["none", "requested", "processing", "refunded", "rejected"],
      default: "none",
    },
    refundAmount: { type: Number, default: 0 },
    refundId: { type: String, default: "" },
    refundReason: { type: String, default: "" },
    refundedAt: { type: Date },
    cancellationReason: { type: String, default: "" },
    cancelledAt: { type: Date },
    giftOptions: {
      isGift: { type: Boolean, default: false },
      cardTheme: { type: String, default: "Birthday" },
      giftMessage: { type: String, default: "" },
      ribbonColor: { type: String, default: "Burgundy Velvet" },
      hidePrice: { type: Boolean, default: true },
    },
    // Online orders are saved before payment and confirmed by the browser
    // or the Razorpay webhook; unpaid ones expire (TTL index below)
    awaitingPayment: { type: Boolean },
    paymentExpiresAt: { type: Date },
    // Stock bookkeeping so cancellations give stock back exactly once
    stockDeducted: { type: Boolean, default: false },
    stockRestored: { type: Boolean, default: false },
    // GST invoice: numbered in sequence per financial year when the order is confirmed
    invoice: {
      number: String,
      date: Date,
    },
    // When the customer was emailed about shipping / delivery (sent once each)
    notifications: {
      shippedAt: Date,
      deliveredAt: Date,
    },
    scheduledDeliveryDate: { type: String, default: "" },
    deliverySlot: { type: String, default: "Standard Delivery (3-5 Days)" },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "shippingAddress.phone": 1 });
orderSchema.index({ "paymentResult.razorpayOrderId": 1 });
orderSchema.index({ "invoice.number": 1 }, { unique: true, sparse: true });
orderSchema.index({ "items.customization.reference3D.sessionId": 1 }, { sparse: true });
// Abandoned online checkouts are removed automatically once their payment window passes
orderSchema.index({ paymentExpiresAt: 1 }, { expireAfterSeconds: 0 });
// A Razorpay payment can only ever pay for one order
orderSchema.index(
  { "paymentResult.razorpayPaymentId": 1 },
  { unique: true, partialFilterExpression: { "paymentResult.razorpayPaymentId": { $type: "string" } } }
);

export default mongoose.model("Order", orderSchema);
