import Product from "../models/Product.js";
import Coupon from "../models/Coupon.js";
import { isObjectId } from "../utils/security.js";

/**
 * Server-side price catalog for configurable items that are not stored as
 * Product documents. Must stay in sync with the storefront's display prices
 * (ProductCustomizerModal, PersonalizedPage, BuildABox).
 */
export const KEEPSAKE_SIZE_PRICES = {
  // ProductCustomizerModal tiers
  mini: 699,
  classic: 1299,
  grand: 2199,
  // PersonalizedPage tiers
  small: 699,
  medium: 1299,
  large: 2199,
};

export const HAMPER_CATALOG = {
  boxes: { "burgundy-velvet": 299, "classic-ivory": 249, "blush-satin": 349 },
  keepsakes: { "photo-magnet": 349, "polaroid-set": 499, "3d-miniature": 699 },
  addons: { candle: 299, chocolates: 249, "fairy-lights": 149, "dry-fruits": 279, mug: 349 },
};

export const FREE_SHIPPING_THRESHOLD = 999;
export const STANDARD_SHIPPING_FEE = 79;
export const MIDNIGHT_DELIVERY_FEE = 199;
const MAX_QUANTITY = 20;
const MAX_LINE_ITEMS = 50;

export class PricingError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

/**
 * Coupon discount for a given subtotal. Returns { discount } or { error }.
 */
export const calculateCouponDiscount = (coupon, subtotal) => {
  if (!coupon) return { error: "Coupon is invalid or expired" };
  if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
    return { error: `Coupon "${coupon.code}" has expired` };
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    return { error: `Coupon "${coupon.code}" usage limit reached` };
  }
  if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
    return { error: `Minimum order value of ₹${coupon.minOrderAmount} required for coupon ${coupon.code}` };
  }

  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = Math.round((subtotal * coupon.discountAmount) / 100);
    if (coupon.maxDiscount > 0 && discount > coupon.maxDiscount) discount = coupon.maxDiscount;
  } else {
    discount = Math.min(subtotal, coupon.discountAmount);
  }
  return { discount: Math.max(0, discount) };
};

const priceProductOptions = (product, selectedOptions) => {
  let delta = 0;
  const resolved = [];
  for (const opt of Array.isArray(selectedOptions) ? selectedOptions : []) {
    const group = (product.optionGroups || []).find((g) => g.name === opt?.name);
    const value = group?.values?.find((v) => v.label === opt?.value);
    if (group && !value) throw new PricingError(`"${opt.value}" is not a valid ${group.name} for ${product.name}`);
    const priceDelta = value ? Number(value.priceDelta) || 0 : 0;
    delta += priceDelta;
    resolved.push({ name: String(opt?.name ?? ""), value: String(opt?.value ?? ""), priceDelta });
  }
  return { delta, resolved };
};

const sanitizeOptions = (selectedOptions) =>
  (Array.isArray(selectedOptions) ? selectedOptions : []).map((o) => ({
    name: String(o?.name ?? ""),
    value: String(o?.value ?? ""),
    priceDelta: 0,
  }));

/**
 * Compute authoritative order pricing from the cart. Client-supplied prices,
 * discounts and shipping fees are ignored.
 */
export const computeOrderPricing = async ({ items, couponCode, deliverySlot }) => {
  if (!Array.isArray(items) || items.length === 0) throw new PricingError("Your cart is empty");
  if (items.length > MAX_LINE_ITEMS) throw new PricingError("Too many items in cart");

  const productIds = items
    .map((i) => String(i?.productId ?? "").slice(0, 24))
    .filter(isObjectId);
  const products = await Product.find({ _id: { $in: productIds } });
  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const customProduct =
    (await Product.findOne({ $or: [{ slug: "custom-3d-miniature-figurine" }, { isCustomizable: true }] })) ||
    (await Product.findOne());

  const orderItems = items.map((item) => {
    const quantity = Math.floor(Number(item?.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new PricingError(`Quantity must be between 1 and ${MAX_QUANTITY}`);
    }

    const rawId = String(item?.productId ?? "");
    const product = productMap.get(rawId.slice(0, 24));
    let unitPrice;
    let selectedOptions;
    let linkedProduct = product || customProduct;

    if (item?.hamper) {
      const { boxId, keepsakeId, addonIds } = item.hamper;
      const box = HAMPER_CATALOG.boxes[boxId];
      const keepsake = HAMPER_CATALOG.keepsakes[keepsakeId];
      const addons = Array.isArray(addonIds) ? [...new Set(addonIds)] : [];
      if (box === undefined || keepsake === undefined || addons.some((a) => HAMPER_CATALOG.addons[a] === undefined)) {
        throw new PricingError("Your custom hamper has an invalid selection. Please rebuild it.");
      }
      unitPrice = box + keepsake + addons.reduce((sum, a) => sum + HAMPER_CATALOG.addons[a], 0);
      selectedOptions = sanitizeOptions(item.selectedOptions);
    } else if (item?.sizeId) {
      unitPrice = KEEPSAKE_SIZE_PRICES[item.sizeId];
      if (unitPrice === undefined) throw new PricingError("Invalid keepsake size selected");
      selectedOptions = sanitizeOptions(item.selectedOptions);
    } else if (product && product.isActive !== false && rawId.length === 24) {
      const { delta, resolved } = priceProductOptions(product, item.selectedOptions);
      unitPrice = product.price + delta;
      selectedOptions = resolved;
    } else {
      throw new PricingError(
        "One of the items in your cart is no longer available. Please remove it and add it again."
      );
    }

    if (!linkedProduct) throw new PricingError("Catalog is not available");

    return {
      product: linkedProduct._id,
      name: String(item.name || product?.name || "Custom 3D Keepsake").slice(0, 200),
      image: item.image || item.customization?.photoUrl || linkedProduct.images?.[0],
      price: unitPrice,
      quantity,
      selectedOptions,
      customization: item.customization || {},
    };
  });

  const itemsPrice = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  let shippingPrice = itemsPrice >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
  if (typeof deliverySlot === "string" && deliverySlot.toLowerCase().includes("midnight")) {
    shippingPrice += MIDNIGHT_DELIVERY_FEE;
  }

  let coupon = null;
  let discountPrice = 0;
  if (couponCode) {
    const cleanCode = String(couponCode).trim().toUpperCase();
    coupon = await Coupon.findOne({ code: cleanCode, isActive: true });
    const result = calculateCouponDiscount(coupon, itemsPrice);
    if (result.error) throw new PricingError(coupon ? result.error : `Coupon "${cleanCode}" is invalid or expired`);
    discountPrice = result.discount;
  }

  const totalPrice = Math.max(0, itemsPrice + shippingPrice - discountPrice);

  return { orderItems, itemsPrice, shippingPrice, discountPrice, totalPrice, coupon };
};
