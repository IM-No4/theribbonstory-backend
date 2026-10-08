import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { sendOrderShippedEmail, sendOrderDeliveredEmail } from "./emailService.js";

/**
 * Where the delivered email's "Leave a review" goes: the product page of the
 * first catalog item (which opens its review form), else the account page.
 */
const reviewPathFor = async (order) => {
  const ids = (order.items || []).filter((i) => i.product).map((i) => i.product);
  if (ids.length === 0) return "/account";
  try {
    const products = await Product.find({ _id: { $in: ids }, isActive: { $ne: false } }).select("slug");
    const slugById = new Map(products.map((p) => [String(p._id), p.slug]));
    const slug = ids.map((id) => slugById.get(String(id))).find(Boolean);
    return slug ? `/product/${encodeURIComponent(slug)}?review=1` : "/account";
  } catch {
    return "/account";
  }
};

/**
 * Email the customer when their order ships or is delivered. Each email is
 * sent at most once per order, however often the status is changed (admin
 * edits, Shiprocket webhooks, retries). Fire-and-forget.
 */
export const notifyStatusChange = async (order, previousStatus) => {
  if (!order || order.status === previousStatus) return;
  const to = { order, userEmail: order.user?.email, userName: order.user?.name || order.shippingAddress?.name };

  try {
    if (order.status === "shipped" && !order.notifications?.shippedAt) {
      if (await sendOrderShippedEmail(to)) {
        await Order.updateOne({ _id: order._id }, { $set: { "notifications.shippedAt": new Date() } });
      }
    } else if (order.status === "delivered" && !order.notifications?.deliveredAt) {
      if (await sendOrderDeliveredEmail({ ...to, reviewPath: await reviewPathFor(order) })) {
        await Order.updateOne({ _id: order._id }, { $set: { "notifications.deliveredAt": new Date() } });
      }
    }
  } catch (err) {
    console.error(`[OrderNotifications] Status email for ${order._id} failed:`, err.message);
  }
};
