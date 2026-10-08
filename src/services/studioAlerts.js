import Product from "../models/Product.js";
import { getTransporter, EMAIL_SENDERS } from "./emailService.js";
import { escapeHtml as esc } from "../utils/security.js";

/**
 * Internal emails to the studio team: new orders, confirmed payments,
 * cancellation requests, payment problems and low stock. Fire-and-forget:
 * a mail failure is logged and never affects the customer's request.
 */

export const getStudioRecipients = () =>
  (process.env.STUDIO_ALERT_EMAIL || process.env.ADMIN_EMAIL || "contact@theribbonstory.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const getLowStockThreshold = () => {
  const n = Number(process.env.LOW_STOCK_THRESHOLD);
  return Number.isFinite(n) && n >= 0 ? n : 5;
};

const adminUrl = (path) => `${(process.env.CLIENT_URL || "https://theribbonstory.com").split(",")[0].trim()}${path}`;
const shortId = (order) => `#${String(order._id).slice(-6).toUpperCase()}`;
const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const send = async ({ subject, html, text }) => {
  const to = getStudioRecipients();
  if (to.length === 0) return;
  try {
    await getTransporter("NOREPLY").sendMail({ from: EMAIL_SENDERS.NOREPLY, to: to.join(", "), subject, html, text });
  } catch (err) {
    console.error(`[StudioAlerts] Could not send "${subject}":`, err.message);
  }
};

const itemsTable = (order) => {
  const rows = (order.items || [])
    .map((item) => {
      const options = (item.selectedOptions || []).map((o) => `${esc(o.name)}: ${esc(o.value)}`).join(" · ");
      const note = item.customization?.note ? `<div style="color:#9E3D52;font-style:italic">“${esc(item.customization.note)}”</div>` : "";
      const photo = item.customization?.photoUrl ? `<div style="color:#666">Customer photo attached</div>` : "";
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee"><strong>${esc(item.name)}</strong>${options ? `<div style="color:#666">${options}</div>` : ""}${note}${photo}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${esc(item.quantity)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${rupees(item.price * item.quantity)}</td>
      </tr>`;
    })
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-size:13px">${rows}</table>`;
};

const customerBlock = (order) => {
  const a = order.shippingAddress || {};
  const customer = order.user && typeof order.user === "object" ? order.user : {};
  return `<p style="font-size:13px;line-height:1.5">
    <strong>${esc(a.name || customer.name || "Customer")}</strong>${customer.email ? ` · ${esc(customer.email)}` : ""}${a.phone ? ` · ${esc(a.phone)}` : ""}<br>
    ${esc([a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(", "))}
  </p>`;
};

const wrap = (heading, body, cta = "Open in admin") => `
  <div style="font-family:Arial,sans-serif;color:#222;max-width:640px">
    <h2 style="color:#4A1F29;margin:0 0 12px">${heading}</h2>
    ${body}
    <p style="margin-top:18px"><a href="${adminUrl("/admin/orders")}" style="background:#9E3D52;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${cta}</a></p>
  </div>`;

/** A new order the studio should start on: COD placed, or online payment confirmed */
export const alertNewOrder = (order) => {
  const paid = order.paymentMethod === "razorpay";
  const gift = order.giftOptions?.isGift
    ? `<p style="font-size:13px"><strong>🎁 Gift</strong>${order.giftOptions.giftMessage ? `: “${esc(order.giftOptions.giftMessage)}”` : ""}</p>`
    : "";
  const html = wrap(
    `New order ${shortId(order)} — ${rupees(order.totalPrice)} ${paid ? "(paid online)" : "(cash on delivery)"}`,
    `${customerBlock(order)}
     ${itemsTable(order)}
     <p style="font-size:13px"><strong>Total:</strong> ${rupees(order.totalPrice)}${order.couponCode ? ` · coupon ${esc(order.couponCode)}` : ""} · <strong>Delivery:</strong> ${esc(order.deliverySlot || "Standard")}</p>
     ${gift}`
  );
  return send({
    subject: `🛍️ New order ${shortId(order)} · ${rupees(order.totalPrice)} · ${paid ? "Paid" : "COD"}`,
    html,
    text: `New order ${shortId(order)} for ${rupees(order.totalPrice)} (${paid ? "paid online" : "cash on delivery"}). ${adminUrl("/admin/orders")}`,
  });
};

/** Customer cancelled (auto-refunded) or asked to cancel an order already in production */
export const alertCancellation = (order, { autoRefunded }) => {
  const heading = autoRefunded
    ? `Order ${shortId(order)} cancelled by the customer — refunded ${rupees(order.refundAmount || order.totalPrice)}`
    : `Cancellation requested for ${shortId(order)} — needs your review`;
  const html = wrap(
    heading,
    `${customerBlock(order)}
     <p style="font-size:13px"><strong>Reason:</strong> ${esc(order.cancellationReason || "Not given")}</p>
     ${itemsTable(order)}
     ${autoRefunded ? "" : `<p style="font-size:13px;color:#9E3D52"><strong>Action needed:</strong> approve or reject the refund in the admin panel.</p>`}`,
    autoRefunded ? "Open in admin" : "Review request"
  );
  return send({
    subject: autoRefunded
      ? `↩️ Cancelled & refunded: ${shortId(order)}`
      : `⚠️ Cancellation request: ${shortId(order)} (needs review)`,
    html,
    text: `${heading}. ${adminUrl("/admin/orders")}`,
  });
};

/** A customer paid but the order could not be confirmed automatically */
export const alertPaymentIssue = ({ razorpayOrderId, razorpayPaymentId, amountPaise, reason }) => {
  const html = wrap(
    "⚠️ Payment received but not matched to an order",
    `<p style="font-size:13px">Razorpay reported a payment that could not be confirmed automatically. Check it in the Razorpay dashboard and the admin panel.</p>
     <p style="font-size:13px;line-height:1.6">
       <strong>Payment:</strong> ${esc(razorpayPaymentId)}<br>
       <strong>Razorpay order:</strong> ${esc(razorpayOrderId)}<br>
       <strong>Amount:</strong> ${rupees(Number(amountPaise) / 100)}<br>
       <strong>Problem:</strong> ${esc(reason)}
     </p>`
  );
  return send({
    subject: `⚠️ Payment needs attention: ${razorpayPaymentId}`,
    html,
    text: `Payment ${razorpayPaymentId} (${razorpayOrderId}) needs attention: ${reason}`,
  });
};

/**
 * After stock was taken for these order items, warn about products that
 * just dropped to the low-stock threshold or below (once per crossing,
 * not on every later order).
 */
export const checkLowStock = async (items) => {
  const threshold = getLowStockThreshold();
  const taken = new Map();
  for (const item of items || []) {
    if (!item.fromCatalog || !item.product) continue;
    const id = String(item.product);
    taken.set(id, (taken.get(id) || 0) + item.quantity);
  }
  if (taken.size === 0) return;

  try {
    const low = await Product.find({ _id: { $in: [...taken.keys()] }, stock: { $lte: threshold } }).select("name stock slug");
    const crossed = low.filter((p) => p.stock + (taken.get(String(p._id)) || 0) > threshold);
    if (crossed.length === 0) return;

    const rows = crossed
      .map((p) => `<li><strong>${esc(p.name)}</strong> — ${p.stock <= 0 ? "<span style=\"color:#b00\">out of stock</span>" : `${p.stock} left`}</li>`)
      .join("");
    await send({
      subject: `📦 Low stock: ${crossed.map((p) => `${p.name} (${Math.max(0, p.stock)})`).join(", ")}`,
      html: `<div style="font-family:Arial,sans-serif;color:#222">
        <h2 style="color:#4A1F29">Low stock (${threshold} or fewer)</h2>
        <ul style="font-size:13px">${rows}</ul>
        <p><a href="${adminUrl("/admin/products")}">Update stock in the admin panel</a></p>
      </div>`,
      text: `Low stock: ${crossed.map((p) => `${p.name}: ${p.stock}`).join(", ")}`,
    });
  } catch (err) {
    console.error("[StudioAlerts] Low-stock check failed:", err.message);
  }
};
