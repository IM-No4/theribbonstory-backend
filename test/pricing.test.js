import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { mock, query } from "./helpers.js";
import Product from "../src/models/Product.js";
import Coupon from "../src/models/Coupon.js";
import {
  computeOrderPricing,
  calculateCouponDiscount,
  KEEPSAKE_SIZE_PRICES,
  HAMPER_CATALOG,
} from "../src/services/pricingService.js";

const PRODUCT_ID = new mongoose.Types.ObjectId().toString();
const CUSTOM_ID = new mongoose.Types.ObjectId();

const product = {
  _id: PRODUCT_ID,
  name: "Acrylic Photo Magnet",
  price: 500,
  isActive: true,
  images: ["/uploads/magnet.jpg"],
  optionGroups: [
    {
      name: "Size",
      values: [
        { label: "Small", priceDelta: 0 },
        { label: "Large", priceDelta: 200 },
      ],
    },
  ],
};

const coupons = {
  SAVE10: { _id: "c1", code: "SAVE10", discountType: "percentage", discountAmount: 10, maxDiscount: 0, usageLimit: 100, usedCount: 0 },
  FLAT100: { _id: "c2", code: "FLAT100", discountType: "fixed", discountAmount: 100, minOrderAmount: 1000, usageLimit: 100, usedCount: 0 },
};

beforeEach(() => {
  mock.method(Product, "find", () => query([product]));
  mock.method(Product, "findOne", () => query({ _id: CUSTOM_ID, images: ["/uploads/custom.jpg"] }));
  mock.method(Coupon, "findOne", (q) => query(coupons[q.code] || null));
});
afterEach(() => mock.restoreAll());

describe("computeOrderPricing", () => {
  it("ignores client-supplied prices, option deltas, discounts and shipping", async () => {
    const pricing = await computeOrderPricing({
      items: [
        {
          productId: PRODUCT_ID,
          price: 1,
          quantity: 2,
          discountPrice: 9999,
          selectedOptions: [{ name: "Size", value: "Large", priceDelta: -9999 }],
        },
      ],
    });
    assert.equal(pricing.itemsPrice, 1400); // (500 + 200) × 2
    assert.equal(pricing.orderItems[0].selectedOptions[0].priceDelta, 200);
    assert.equal(pricing.shippingPrice, 0);
    assert.equal(pricing.discountPrice, 0);
    assert.equal(pricing.totalPrice, 1400);
  });

  it("charges standard shipping under the free-shipping threshold", async () => {
    const pricing = await computeOrderPricing({ items: [{ productId: PRODUCT_ID, quantity: 1 }] });
    assert.equal(pricing.shippingPrice, 79);
    assert.equal(pricing.totalPrice, 579);
  });

  it("adds the midnight delivery surcharge", async () => {
    const pricing = await computeOrderPricing({
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      deliverySlot: "Midnight Surprise (11pm-12am)",
    });
    assert.equal(pricing.shippingPrice, 79 + 199);
  });

  it("applies coupons on the server-computed subtotal", async () => {
    const pricing = await computeOrderPricing({ items: [{ productId: PRODUCT_ID, quantity: 2 }], couponCode: " save10 " });
    assert.equal(pricing.discountPrice, 100);
    assert.equal(pricing.totalPrice, 900);
    assert.equal(pricing.coupon.code, "SAVE10");
  });

  it("rejects unknown coupons and unmet minimums", async () => {
    await assert.rejects(computeOrderPricing({ items: [{ productId: PRODUCT_ID, quantity: 1 }], couponCode: "FAKE" }), /invalid or expired/);
    await assert.rejects(computeOrderPricing({ items: [{ productId: PRODUCT_ID, quantity: 1 }], couponCode: "FLAT100" }), /Minimum order value/);
  });

  it("rejects an option value the product does not offer", async () => {
    await assert.rejects(
      computeOrderPricing({ items: [{ productId: PRODUCT_ID, quantity: 1, selectedOptions: [{ name: "Size", value: "Huge" }] }] }),
      /not a valid Size/
    );
  });

  it("rejects items that are not a known product, size or hamper", async () => {
    await assert.rejects(
      computeOrderPricing({ items: [{ productId: "custom-hamper-123", price: 1, quantity: 1 }] }),
      /no longer available/
    );
  });

  it("prices 3D keepsake sizes from the server catalog", async () => {
    for (const [sizeId, price] of Object.entries(KEEPSAKE_SIZE_PRICES)) {
      const pricing = await computeOrderPricing({ items: [{ productId: `${PRODUCT_ID}-${sizeId}`, sizeId, price: 1, quantity: 1 }] });
      assert.equal(pricing.itemsPrice, price, sizeId);
      assert.equal(String(pricing.orderItems[0].product), PRODUCT_ID);
    }
    await assert.rejects(computeOrderPricing({ items: [{ productId: "x", sizeId: "free", quantity: 1 }] }), /Invalid keepsake size/);
  });

  it("prices hampers from the server catalog and ignores duplicate add-ons", async () => {
    const pricing = await computeOrderPricing({
      items: [
        {
          productId: "custom-hamper-1",
          price: 1,
          quantity: 1,
          hamper: { boxId: "burgundy-velvet", keepsakeId: "3d-miniature", addonIds: ["candle", "chocolates", "candle"] },
        },
      ],
    });
    const { boxes, keepsakes, addons } = HAMPER_CATALOG;
    assert.equal(pricing.itemsPrice, boxes["burgundy-velvet"] + keepsakes["3d-miniature"] + addons.candle + addons.chocolates);
    assert.equal(String(pricing.orderItems[0].product), String(CUSTOM_ID));
  });

  it("rejects hampers with unknown parts", async () => {
    await assert.rejects(
      computeOrderPricing({ items: [{ productId: "h", quantity: 1, hamper: { boxId: "gold", keepsakeId: "photo-magnet", addonIds: [] } }] }),
      /invalid selection/
    );
  });

  it("rejects invalid quantities and empty carts", async () => {
    for (const quantity of [0, -5, 1.5e6, "abc"]) {
      await assert.rejects(computeOrderPricing({ items: [{ productId: PRODUCT_ID, quantity }] }), /Quantity/, String(quantity));
    }
    await assert.rejects(computeOrderPricing({ items: [] }), /empty/);
  });

  it("errors carry a 400 status for the error handler", async () => {
    await assert.rejects(computeOrderPricing({ items: [] }), (err) => err.statusCode === 400);
  });
});

describe("calculateCouponDiscount", () => {
  it("caps percentage discounts at maxDiscount", () => {
    const coupon = { code: "BIG", discountType: "percentage", discountAmount: 50, maxDiscount: 250, usageLimit: 0, usedCount: 0 };
    assert.deepEqual(calculateCouponDiscount(coupon, 2000), { discount: 250 });
  });

  it("never discounts more than the subtotal", () => {
    const coupon = { code: "F", discountType: "fixed", discountAmount: 500, usageLimit: 0, usedCount: 0 };
    assert.deepEqual(calculateCouponDiscount(coupon, 300), { discount: 300 });
  });

  it("rejects expired and exhausted coupons", () => {
    const base = { code: "X", discountType: "fixed", discountAmount: 10 };
    assert.match(calculateCouponDiscount({ ...base, validUntil: new Date(Date.now() - 1000) }, 100).error, /expired/);
    assert.match(calculateCouponDiscount({ ...base, usageLimit: 5, usedCount: 5 }, 100).error, /usage limit/);
  });
});
