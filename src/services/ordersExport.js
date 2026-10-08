import Order from "../models/Order.js";
import { invoiceData } from "./invoiceService.js";

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const EXPORT_LIMIT = 10000;
const STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

/** "2026-10-08" -> the UTC instant of IST midnight that day */
const istDayStart = (ymd) => {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isNaN(t) || !/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? null : new Date(t - IST_OFFSET_MS);
};
const istDateTime = (d) =>
  d ? new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16) : "";

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (=, +, -, @)
 * is prefixed with ' so an address like "=HYPERLINK(...)" stays text.
 */
export const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const COLUMNS = [
  ["Order ID", (o) => String(o._id)],
  ["Order no.", (o) => `#${String(o._id).slice(-6).toUpperCase()}`],
  ["Order date (IST)", (o) => istDateTime(o.createdAt)],
  ["Invoice no.", (o) => o.invoice?.number || ""],
  ["Status", (o) => o.status],
  ["Payment", (o) => (o.paymentMethod === "cod" ? "COD" : "Online")],
  ["Paid", (o) => (o.isPaid ? "Yes" : "No")],
  ["Customer", (o) => o.shippingAddress?.name || o.user?.name || ""],
  ["Email", (o) => o.user?.email || ""],
  ["Phone", (o) => o.shippingAddress?.phone || ""],
  ["Address", (o) => [o.shippingAddress?.line1, o.shippingAddress?.line2].filter(Boolean).join(", ")],
  ["City", (o) => o.shippingAddress?.city || ""],
  ["State", (o) => o.shippingAddress?.state || ""],
  ["PIN", (o) => o.shippingAddress?.postalCode || ""],
  [
    "Items",
    (o) =>
      (o.items || [])
        .map((i) => {
          const c = i.customization || {};
          const inscription = [c.customName, c.customDate].filter(Boolean).join(" · ");
          return `${i.name} x${i.quantity}${inscription ? ` [${inscription}]` : ""}`;
        })
        .join("; "),
  ],
  ["Units", (o) => (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0)],
  ["Subtotal", (o) => o.itemsPrice || 0],
  ["Discount", (o) => o.discountPrice || 0],
  ["Coupon", (o) => o.couponCode || ""],
  ["Delivery", (o) => o.shippingPrice || 0],
  ["Total", (o) => o.totalPrice || 0],
  ["Taxable value", (o, t) => t.taxable],
  ["CGST", (o, t) => t.cgst],
  ["SGST", (o, t) => t.sgst],
  ["IGST", (o, t) => t.igst],
  ["Refunded", (o) => (o.isRefunded ? o.refundAmount || 0 : 0)],
  ["Tracking no.", (o) => o.awbCode || o.trackingNumber || ""],
];

/** Orders placed between two IST dates (inclusive), as CSV text for Excel / Sheets */
export const exportOrdersCsv = async ({ from, to, status = "all" } = {}) => {
  const filter = { awaitingPayment: { $ne: true } };
  const start = from && istDayStart(from);
  const endDay = to && istDayStart(to);
  if (from && !start) throw Object.assign(new Error("Invalid 'from' date (use YYYY-MM-DD)"), { statusCode: 400 });
  if (to && !endDay) throw Object.assign(new Error("Invalid 'to' date (use YYYY-MM-DD)"), { statusCode: 400 });
  if (start || endDay) {
    filter.createdAt = {};
    if (start) filter.createdAt.$gte = start;
    if (endDay) filter.createdAt.$lt = new Date(endDay.getTime() + DAY_MS);
  }
  if (status && status !== "all") {
    if (!STATUSES.includes(status)) throw Object.assign(new Error("Unknown status"), { statusCode: 400 });
    filter.status = status;
  }

  const orders = await Order.find(filter).populate("user", "name email").sort({ createdAt: 1 }).limit(EXPORT_LIMIT).lean();
  const lines = [COLUMNS.map(([h]) => csvCell(h)).join(",")];
  for (const o of orders) {
    const { tax } = invoiceData(o);
    lines.push(COLUMNS.map(([, get]) => csvCell(get(o, tax))).join(","));
  }
  // BOM so Excel opens the file as UTF-8 (names, ₹, emoji)
  return { csv: `\uFEFF${lines.join("\r\n")}\r\n`, count: orders.length, truncated: orders.length === EXPORT_LIMIT };
};
