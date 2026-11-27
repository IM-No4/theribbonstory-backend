import crypto from "crypto";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import { getJwtSecret, isObjectId, safeEqual } from "../utils/security.js";

const MAX_LINES = 50;
const MAX_QUANTITY = 20;
export const REMINDER_MIN_IDLE_MS = 60 * 60 * 1000; // they may still be shopping
export const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const hostedImage = (value) => typeof value === "string" && /^\/(uploads|images|src\/assets\/images)\/[\w./-]+$/.test(value);
const short = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * Turn what the browser holds (or what was saved) into cart lines. Names,
 * pictures and prices of catalog products always come from the database, since
 * they are later shown in emails. Products no longer on sale are dropped.
 */
export const resolveCartLines = async (items) => {
  const list = (Array.isArray(items) ? items : []).slice(0, MAX_LINES);
  const ids = list.map((i) => String(i?.productId ?? "")).filter((id) => id.length === 24 && isObjectId(id));
  const products = ids.length ? await Product.find({ _id: { $in: ids } }) : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const lines = [];

  for (const item of list) {
    const quantity = Math.floor(Number(item?.quantity));
    if (!(quantity >= 1)) continue;
    const productId = short(String(item?.productId ?? ""), 80);
    const product = byId.get(productId);
    const customization = item?.customization || {};
    const custom = Boolean(
      item?.custom || item?.hamper || item?.sizeId || customization.photoUrl || customization.cuteImageUrl || customization.reference3D
    );

    if (product && !custom && !product.isCustomizable) {
      if (product.isActive === false || (typeof product.stock === "number" && product.stock <= 0)) continue;
      const chosen = item.options || item.selectedOptions || [];
      const options = [];
      for (const option of Array.isArray(chosen) ? chosen : []) {
        const value = product.optionGroups?.find((g) => g.name === option?.name)?.values?.find((v) => v.label === option?.value);
        if (value) options.push({ name: option.name, value: value.label, priceDelta: Number(value.priceDelta) || 0 });
      }
      const extras = options.reduce((sum, o) => sum + o.priceDelta, 0);
      lines.push({
        productId,
        name: product.name,
        image: product.images?.[0] || "",
        basePrice: product.price,
        price: product.price + extras,
        quantity: Math.min(quantity, MAX_QUANTITY),
        options,
        custom: false,
        stock: product.stock,
      });
    } else if (custom || product) {
      const price = Number(item?.price);
      lines.push({
        productId,
        name: short(item?.name, 120) || "Personalised keepsake",
        image: hostedImage(item?.image) ? item.image : "",
        basePrice: price >= 0 && price <= 100000 ? price : 0,
        price: price >= 0 && price <= 100000 ? price : 0,
        quantity: Math.min(quantity, MAX_QUANTITY),
        options: [],
        custom: true,
      });
    }
  }
  return lines;
};

export const cartSignature = (lines) =>
  (lines || [])
    .map((l) => [l.productId, l.quantity, (l.options || []).map((o) => o.value).join(",")].join(":"))
    .sort()
    .join("|");

export const cartTotal = (lines) => lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

/** Latest completed order per user, to tell abandoned carts from bought ones */
export const lastOrderDates = async (userIds) => {
  const rows = await Order.aggregate([
    {
      $match: {
        user: { $in: userIds },
        status: { $ne: "cancelled" },
        $or: [{ isPaid: true }, { paymentMethod: "cod" }],
      },
    },
    { $group: { _id: "$user", at: { $max: "$createdAt" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.at]));
};

// Unsubscribe links carry a signature, so nobody can unsubscribe someone else.
// (Deliberately not a login token.)
export const unsubscribeSignature = (userId) =>
  crypto.createHmac("sha256", `${getJwtSecret()}:cart-reminders`).update(String(userId)).digest("hex");

export const validUnsubscribe = (userId, signature) =>
  isObjectId(String(userId)) && safeEqual(signature, unsubscribeSignature(userId));
