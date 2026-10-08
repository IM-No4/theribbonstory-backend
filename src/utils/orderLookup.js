import Order from "../models/Order.js";
import { escapeRegex, isObjectId } from "./security.js";

/**
 * Find an order from a customer-facing identifier: full order id, exact
 * tracking/AWB number, or the 6+ character order code shown to customers
 * (e.g. "#3F9A1C"). No partial/regex matching on user input.
 */
export const findOrderByPublicIdentifier = async (identifier) => {
  const cleanId = String(identifier || "").trim().replace(/^#/, "");
  if (!cleanId || cleanId.length > 64) return null;

  if (isObjectId(cleanId)) return Order.findById(cleanId);

  const exact = new RegExp(`^${escapeRegex(cleanId)}$`, "i");
  const order = await Order.findOne({
    $or: [{ trackingNumber: exact }, { awbCode: exact }, { shiprocketOrderId: cleanId }],
  });
  if (order) return order;

  // Short order code: last 6+ hex chars of the order id, among recent orders
  if (/^[0-9a-fA-F]{6,23}$/.test(cleanId)) {
    const recent = await Order.find().select("_id").sort({ createdAt: -1 }).limit(200);
    const match = recent.find((o) => o._id.toString().endsWith(cleanId.toLowerCase()));
    if (match) return Order.findById(match._id);
  }
  return null;
};
