import mongoose from "mongoose";

export const EVENT_TYPES = [
  "page_view",
  "click",
  "product_view",
  "add_to_cart",
  "remove_from_cart",
  "begin_checkout",
  "purchase",
  "search",
];
// Raw events are deleted automatically after about 13 months
export const RETENTION_DAYS = 395;

/**
 * First-party storefront analytics. Visitors are random IDs made in the browser:
 * no names, emails, IP addresses or account IDs are stored.
 */
const analyticsEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: EVENT_TYPES, required: true },
    visitorId: { type: String, required: true },
    sessionId: { type: String, required: true },
    path: String,
    label: String, // clicked text or search term
    productId: String,
    productName: String,
    quantity: Number,
    value: Number,
    orderId: String, // purchases only
    // How this visit arrived (from ad link tags or the referring site)
    source: { type: String, default: "direct" },
    medium: { type: String, default: "none" },
    campaign: { type: String, default: "" },
    device: { type: String, default: "desktop" },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

analyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400 });
analyticsEventSchema.index({ type: 1, createdAt: 1 });
// One purchase event per order
analyticsEventSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { type: "purchase" } });

export default mongoose.model("AnalyticsEvent", analyticsEventSchema);
