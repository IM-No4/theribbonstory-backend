import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { mock, query, startServer, fakeUser, authAs } from "./helpers.js";
import Product from "../src/models/Product.js";
import Coupon from "../src/models/Coupon.js";
import Order from "../src/models/Order.js";
import User from "../src/models/User.js";
import { razorpayGateway } from "../src/controllers/paymentController.js";

const PRODUCT_ID = new mongoose.Types.ObjectId().toString();
const product = { _id: PRODUCT_ID, name: "Magnet", price: 500, isActive: true, images: [], optionGroups: [] };
const address = { name: "A", line1: "1 Road", city: "Mumbai", state: "MH", postalCode: "400001", phone: "9999999999" };
const cart = [{ productId: PRODUCT_ID, quantity: 1, price: 1 }]; // server total: 500 + 79 shipping = 579

const RZP_SECRET = "test_razorpay_secret";
const sign = (orderId, paymentId) =>
  crypto.createHmac("sha256", RZP_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

let server;
let user;
let token;
let created;

before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});

beforeEach(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = RZP_SECRET;
  user = fakeUser();
  token = authAs(User, user);
  created = null;
  mock.method(Product, "find", () => query([product]));
  mock.method(Product, "findOne", () => query({ _id: new mongoose.Types.ObjectId(), images: [] }));
  mock.method(Coupon, "findOne", () => query(null));
  mock.method(Order, "exists", () => query(null));
  mock.method(Order, "create", async (doc) => (created = { ...doc, _id: new mongoose.Types.ObjectId() }));
});
afterEach(() => {
  mock.restoreAll();
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
});

const post = (path, body, { auth = true } = {}) =>
  fetch(`${server.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

/** Fake Razorpay SDK instance whose payment lookup returns `payment` */
const fakeGateway = (payment) => {
  const instance = {
    payments: { fetch: async () => payment },
    orders: { create: async (o) => ({ id: "order_test_1", ...o }) },
  };
  mock.method(razorpayGateway, "getInstance", () => instance);
  return instance;
};

describe("POST /api/orders", () => {
  it("requires login", async () => {
    const res = await post("/api/orders", { items: cart, shippingAddress: address, paymentMethod: "cod" }, { auth: false });
    assert.equal(res.status, 401);
  });

  it("prices COD orders on the server and leaves them unpaid", async () => {
    const res = await post("/api/orders", {
      items: cart,
      shippingAddress: address,
      paymentMethod: "cod",
      discountPrice: 99999,
      shippingPrice: 0,
      paymentResult: { razorpayPaymentId: "pay_fake" },
    });
    assert.equal(res.status, 201);
    assert.equal(created.totalPrice, 579);
    assert.equal(created.discountPrice, 0);
    assert.equal(created.isPaid, false);
    assert.equal(created.paymentResult, undefined);
  });

  it("rejects an unknown payment method", async () => {
    const res = await post("/api/orders", { items: cart, shippingAddress: address, paymentMethod: "free" });
    assert.equal(res.status, 400);
  });

  it("returns 503 for Razorpay when the gateway is not configured", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    const res = await post("/api/orders", {
      items: cart,
      shippingAddress: address,
      paymentMethod: "razorpay",
      paymentResult: { razorpayOrderId: "order_1", razorpayPaymentId: "pay_mock_1", razorpaySignature: "x" },
    });
    assert.equal(res.status, 503);
    assert.equal(created, null);
  });

  it("rejects a forged Razorpay signature", async () => {
    fakeGateway({ order_id: "order_1", status: "captured", amount: 57900, currency: "INR" });
    const res = await post("/api/orders", {
      items: cart,
      shippingAddress: address,
      paymentMethod: "razorpay",
      paymentResult: { razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", razorpaySignature: "deadbeef" },
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /signature/);
    assert.equal(created, null);
  });

  it("rejects a payment for a smaller amount than the order total", async () => {
    fakeGateway({ order_id: "order_1", status: "captured", amount: 100, currency: "INR" });
    const res = await post("/api/orders", {
      items: cart,
      shippingAddress: address,
      paymentMethod: "razorpay",
      paymentResult: { razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", razorpaySignature: sign("order_1", "pay_1") },
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /does not match/);
  });

  it("rejects a payment that belongs to a different Razorpay order", async () => {
    fakeGateway({ order_id: "order_other", status: "captured", amount: 57900, currency: "INR" });
    const res = await post("/api/orders", {
      items: cart,
      shippingAddress: address,
      paymentMethod: "razorpay",
      paymentResult: { razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", razorpaySignature: sign("order_1", "pay_1") },
    });
    assert.equal(res.status, 400);
  });

  it("rejects a payment that has not completed", async () => {
    fakeGateway({ order_id: "order_1", status: "failed", amount: 57900, currency: "INR" });
    const res = await post("/api/orders", {
      items: cart,
      shippingAddress: address,
      paymentMethod: "razorpay",
      paymentResult: { razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", razorpaySignature: sign("order_1", "pay_1") },
    });
    assert.equal(res.status, 400);
  });

  it("rejects reusing a payment id from another order", async () => {
    mock.method(Order, "exists", () => query({ _id: "existing" }));
    const res = await post("/api/orders", {
      items: cart,
      shippingAddress: address,
      paymentMethod: "razorpay",
      paymentResult: { razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", razorpaySignature: sign("order_1", "pay_1") },
    });
    assert.equal(res.status, 409);
  });

  it("marks a fully verified Razorpay payment as paid", async () => {
    fakeGateway({ order_id: "order_1", status: "captured", amount: 57900, currency: "INR" });
    const res = await post("/api/orders", {
      items: cart,
      shippingAddress: address,
      paymentMethod: "razorpay",
      paymentResult: { razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", razorpaySignature: sign("order_1", "pay_1") },
    });
    assert.equal(res.status, 201);
    assert.equal(created.isPaid, true);
    assert.equal(created.paymentResult.razorpayPaymentId, "pay_1");
    assert.equal(created.totalPrice, 579);
  });
});

describe("POST /api/payments/razorpay/order", () => {
  it("charges the server-computed total, not a client amount", async () => {
    let createdOrder;
    const instance = fakeGateway({});
    instance.orders.create = async (o) => (createdOrder = { id: "order_x", ...o });
    const res = await post("/api/payments/razorpay/order", { items: cart, amount: 1 });
    assert.equal(res.status, 201);
    assert.equal(createdOrder.amount, 57900);
    assert.equal((await res.json()).pricing.totalPrice, 579);
  });
});

describe("Order visibility", () => {
  const otherOrder = () => ({ _id: new mongoose.Types.ObjectId(), user: new mongoose.Types.ObjectId(), isRefunded: false });

  it("refund status requires login", async () => {
    const res = await fetch(`${server.url}/api/orders/${new mongoose.Types.ObjectId()}/refund-status`);
    assert.equal(res.status, 401);
  });

  it("refund status of someone else's order is forbidden", async () => {
    const order = otherOrder();
    mock.method(Order, "findById", () => query(order));
    const res = await fetch(`${server.url}/api/orders/${order._id}/refund-status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403);
  });

  it("public tracking matches regex characters literally", async () => {
    let filter;
    mock.method(Order, "findOne", (q) => ((filter = q), query(null)));
    mock.method(Order, "find", () => query([]));
    const res = await fetch(`${server.url}/api/orders/track/${encodeURIComponent(".*")}`);
    assert.equal(res.status, 404);
    const pattern = filter.$or[0].trackingNumber;
    assert.equal(pattern.test("TRS-EXP-123456"), false);
  });

  it("public shipment tracking hides street address and phone", async () => {
    const order = {
      _id: new mongoose.Types.ObjectId(),
      status: "shipped",
      trackingNumber: "TRS-EXP-123456",
      shippingAddress: { ...address },
      items: [],
      shippingLabelUrl: "https://labels/secret.pdf",
    };
    mock.method(Order, "findById", () => query(order));
    const res = await fetch(`${server.url}/api/shipping/track/${order._id}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order.shippingAddress.city, "Mumbai");
    assert.equal(body.order.shippingAddress.line1, undefined);
    assert.equal(body.order.shippingAddress.phone, undefined);
    assert.equal(body.order.shippingLabelUrl, undefined);
  });
});
