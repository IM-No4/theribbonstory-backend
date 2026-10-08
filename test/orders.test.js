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
const address = { name: "A", line1: "1 Road", city: "Mumbai", state: "MH", postalCode: "400001", phone: "9999999999" };
const cart = [{ productId: PRODUCT_ID, quantity: 1, price: 1 }]; // server total: 500 + 79 shipping = 579

const RZP_SECRET = "test_razorpay_secret";
const WEBHOOK_SECRET = "test_webhook_secret";
const sign = (orderId, paymentId) =>
  crypto.createHmac("sha256", RZP_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

let server;
let user;
let token;
let product;
let created;
let stockOps;

/**
 * In-memory stand-in for the orders collection, enough for the payment
 * flow: create, find by id / Razorpay order id, and the atomic
 * "only if unpaid" update that confirms a payment exactly once.
 */
const orders = new Map();
const matches = (doc, filter) =>
  Object.entries(filter).every(([key, cond]) => {
    const value = key.split(".").reduce((v, k) => v?.[k], doc);
    if (cond && typeof cond === "object" && "$ne" in cond) return value !== cond.$ne;
    return String(value) === String(cond);
  });
const stubOrders = () => {
  orders.clear();
  mock.method(Order, "create", async (doc) => {
    created = { _id: doc._id || new mongoose.Types.ObjectId(), ...doc };
    orders.set(String(created._id), created);
    return created;
  });
  mock.method(Order, "exists", () => query(null));
  mock.method(Order, "findById", (id) => query(orders.get(String(id)) || null));
  mock.method(Order, "findOne", (filter) => query([...orders.values()].find((o) => matches(o, filter)) || null));
  mock.method(Order, "findOneAndUpdate", (filter, update) => {
    const doc = [...orders.values()].find((o) => matches(o, filter));
    if (!doc) return query(null);
    for (const [path, value] of Object.entries(update.$set || {})) {
      const keys = path.split(".");
      const last = keys.pop();
      const target = keys.reduce((o, k) => (o[k] ??= {}), doc);
      target[last] = value;
    }
    for (const path of Object.keys(update.$unset || {})) delete doc[path];
    return query(doc);
  });
};

before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});

beforeEach(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = RZP_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  user = fakeUser();
  token = authAs(User, user);
  created = null;
  stockOps = [];
  product = { _id: PRODUCT_ID, name: "Magnet", price: 500, isActive: true, images: [], optionGroups: [], stock: 10 };
  mock.method(Product, "find", () => query([product]));
  mock.method(Product, "findOne", () => query({ _id: new mongoose.Types.ObjectId(), images: [] }));
  mock.method(Product, "findById", () => query(product));
  mock.method(Product, "updateOne", async (filter, update) => {
    const delta = update.$inc.stock;
    if (filter.stock?.$gte !== undefined && product.stock < filter.stock.$gte) return { modifiedCount: 0 };
    product.stock += delta;
    stockOps.push(delta);
    return { modifiedCount: 1 };
  });
  mock.method(Coupon, "findOne", () => query(null));
  mock.method(Coupon, "findOneAndUpdate", () => query({ _id: "c1" }));
  stubOrders();
});
afterEach(() => {
  mock.restoreAll();
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

const post = (path, body, { auth = true, headers = {} } = {}) =>
  fetch(`${server.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** Fake Razorpay SDK instance; `payment` is what a payment lookup returns */
const fakeGateway = (payment = {}) => {
  const instance = {
    payments: {
      fetch: async () => payment,
      refund: async (id, { amount }) => ({ id: "rfnd_1", amount, status: "processed", created_at: 0 }),
    },
    orders: { create: async (o) => ({ id: "order_rzp_1", ...o }) },
  };
  mock.method(razorpayGateway, "getInstance", () => instance);
  return instance;
};

/** Start an online checkout and return our pending order */
const startCheckout = async () => {
  fakeGateway();
  const res = await post("/api/payments/razorpay/order", { items: cart, shippingAddress: address });
  assert.equal(res.status, 201);
  return res.json();
};

const webhook = (body, secret = WEBHOOK_SECRET) => {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return post("/api/payments/razorpay/webhook", raw, { auth: false, headers: { "X-Razorpay-Signature": signature } });
};
const capturedEvent = (amount = 57900, orderId = "order_rzp_1", paymentId = "pay_1") => ({
  event: "payment.captured",
  payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, status: "captured" } } },
});

describe("Cash on delivery orders", () => {
  it("requires login", async () => {
    const res = await post("/api/orders", { items: cart, shippingAddress: address, paymentMethod: "cod" }, { auth: false });
    assert.equal(res.status, 401);
  });

  it("are priced on the server, unpaid, and take stock", async () => {
    const res = await post("/api/orders", {
      items: cart,
      shippingAddress: address,
      paymentMethod: "cod",
      discountPrice: 99999,
      shippingPrice: 0,
    });
    assert.equal(res.status, 201);
    assert.equal(created.totalPrice, 579);
    assert.equal(created.discountPrice, 0);
    assert.equal(created.isPaid, false);
    assert.equal(created.stockDeducted, true);
    assert.equal(product.stock, 9);
  });

  it("are refused when stock runs out", async () => {
    product.stock = 0;
    const res = await post("/api/orders", { items: cart, shippingAddress: address, paymentMethod: "cod" });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /out of stock/);
    assert.equal(created, null);
  });

  it("give stock back if the order cannot be saved", async () => {
    mock.method(Order, "create", async () => {
      throw new Error("db down");
    });
    const res = await post("/api/orders", { items: cart, shippingAddress: address, paymentMethod: "cod" });
    assert.equal(res.status, 500);
    assert.equal(product.stock, 10);
  });

  it("cannot be used to skip online payment", async () => {
    const res = await post("/api/orders", {
      items: cart,
      shippingAddress: address,
      paymentMethod: "razorpay",
      paymentResult: { razorpayPaymentId: "pay_fake" },
    });
    assert.equal(res.status, 400);
    assert.equal(created, null);
  });
});

describe("Online checkout (Razorpay)", () => {
  it("returns 503 when the gateway is not configured", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    const res = await post("/api/payments/razorpay/order", { items: cart, shippingAddress: address });
    assert.equal(res.status, 503);
    assert.equal(created, null);
  });

  it("charges the server-computed total and saves the order as awaiting payment", async () => {
    let rzpOrder;
    const instance = fakeGateway();
    instance.orders.create = async (o) => (rzpOrder = { id: "order_rzp_1", ...o });
    const res = await post("/api/payments/razorpay/order", { items: cart, shippingAddress: address, amount: 1 });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(rzpOrder.amount, 57900);
    assert.equal(rzpOrder.notes.orderId, String(body.orderId));

    assert.equal(String(created._id), String(body.orderId));
    assert.equal(created.status, "pending");
    assert.equal(created.isPaid, false);
    assert.equal(created.awaitingPayment, true);
    assert.equal(created.paymentResult.razorpayOrderId, "order_rzp_1");
    assert.ok(created.paymentExpiresAt > new Date(), "expires in the future");
    assert.equal(product.stock, 10, "stock is only taken once paid");
  });

  it("refuses to start checkout for out-of-stock items", async () => {
    product.stock = 0;
    fakeGateway();
    const res = await post("/api/payments/razorpay/order", { items: cart, shippingAddress: address });
    assert.equal(res.status, 400);
    assert.equal(created, null);
  });

  const confirm = (orderId, overrides = {}) =>
    post(`/api/orders/${orderId}/confirm-payment`, {
      razorpay_order_id: "order_rzp_1",
      razorpay_payment_id: "pay_1",
      razorpay_signature: sign("order_rzp_1", "pay_1"),
      ...overrides,
    });

  it("browser confirmation marks the order paid and takes stock", async () => {
    const { orderId } = await startCheckout();
    fakeGateway({ order_id: "order_rzp_1", status: "captured", amount: 57900, currency: "INR" });
    const res = await confirm(orderId);
    assert.equal(res.status, 200);
    const order = orders.get(String(orderId));
    assert.equal(order.isPaid, true);
    assert.equal(order.status, "confirmed");
    assert.equal(order.awaitingPayment, undefined);
    assert.equal(order.paymentExpiresAt, undefined, "no longer expires");
    assert.equal(order.paymentResult.razorpayPaymentId, "pay_1");
    assert.equal(product.stock, 9);
  });

  it("rejects a forged signature", async () => {
    const { orderId } = await startCheckout();
    fakeGateway({ order_id: "order_rzp_1", status: "captured", amount: 57900, currency: "INR" });
    const res = await confirm(orderId, { razorpay_signature: "deadbeef" });
    assert.equal(res.status, 400);
    assert.equal(orders.get(String(orderId)).isPaid, false);
  });

  it("rejects a payment for a different amount", async () => {
    const { orderId } = await startCheckout();
    fakeGateway({ order_id: "order_rzp_1", status: "captured", amount: 100, currency: "INR" });
    const res = await confirm(orderId);
    assert.equal(res.status, 400);
    assert.equal(orders.get(String(orderId)).isPaid, false);
  });

  it("rejects a payment that has not completed", async () => {
    const { orderId } = await startCheckout();
    fakeGateway({ order_id: "order_rzp_1", status: "failed", amount: 57900, currency: "INR" });
    const res = await confirm(orderId);
    assert.equal(res.status, 400);
  });

  it("rejects confirming someone else's order", async () => {
    const { orderId } = await startCheckout();
    token = authAs(User, fakeUser());
    const res = await confirm(orderId);
    assert.equal(res.status, 404);
  });

  it("rejects a Razorpay order id that belongs to another order", async () => {
    const { orderId } = await startCheckout();
    const res = await confirm(orderId, { razorpay_order_id: "order_other" });
    assert.equal(res.status, 400);
  });
});

describe("Razorpay webhook", () => {
  it("confirms a paid order even if the browser never came back", async () => {
    const { orderId } = await startCheckout();
    const res = await webhook(capturedEvent());
    assert.equal(res.status, 200);
    assert.equal((await res.json()).newlyPaid, true);
    const order = orders.get(String(orderId));
    assert.equal(order.isPaid, true);
    assert.equal(order.status, "confirmed");
    assert.equal(product.stock, 9);
  });

  it("is idempotent with browser confirmation: stock and coupon are applied once", async () => {
    const { orderId } = await startCheckout();
    await webhook(capturedEvent());
    fakeGateway({ order_id: "order_rzp_1", status: "captured", amount: 57900, currency: "INR" });
    const res = await post(`/api/orders/${orderId}/confirm-payment`, {
      razorpay_order_id: "order_rzp_1",
      razorpay_payment_id: "pay_1",
      razorpay_signature: sign("order_rzp_1", "pay_1"),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).order.isPaid, true);
    const again = await webhook(capturedEvent());
    assert.equal((await again.json()).newlyPaid, false);
    assert.deepEqual(stockOps, [-1], "stock taken exactly once");
  });

  it("rejects requests without a valid signature", async () => {
    await startCheckout();
    const res = await webhook(capturedEvent(), "wrong-secret");
    assert.equal(res.status, 401);
    assert.equal(created.isPaid, false);
  });

  it("is disabled until RAZORPAY_WEBHOOK_SECRET is set", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const res = await webhook(capturedEvent());
    assert.equal(res.status, 503);
  });

  it("does not confirm a payment for the wrong amount", async () => {
    const { orderId } = await startCheckout();
    const res = await webhook(capturedEvent(100));
    assert.equal(res.status, 200, "acknowledged so Razorpay stops retrying");
    assert.match((await res.json()).error, /does not match/);
    assert.equal(orders.get(String(orderId)).isPaid, false);
  });

  it("ignores unknown orders and unrelated events", async () => {
    let res = await webhook(capturedEvent(57900, "order_unknown"));
    assert.equal((await res.json()).matched, false);
    res = await webhook({ event: "refund.created", payload: {} });
    assert.equal((await res.json()).ignored, "refund.created");
  });
});

describe("Stock on cancellation", () => {
  it("cancelling a paid order puts its stock back exactly once", async () => {
    const { orderId } = await startCheckout();
    await webhook(capturedEvent());
    assert.equal(product.stock, 9);

    const order = orders.get(String(orderId));
    order.user = { _id: user._id, email: user.email, name: user.name };
    order.save = async () => {};
    mock.method(Order, "findById", () => query(order));

    let res = await post(`/api/orders/${orderId}/cancel`, { reason: "Changed my mind" });
    assert.equal(res.status, 200);
    assert.equal(product.stock, 10);
    res = await post(`/api/orders/${orderId}/cancel`, { reason: "again" });
    assert.equal(product.stock, 10, "not restored twice");
  });
});

describe("Order visibility", () => {
  const otherOrder = () => ({ _id: new mongoose.Types.ObjectId(), user: new mongoose.Types.ObjectId(), isRefunded: false });

  it("customers' order history hides unpaid online checkouts", async () => {
    let filter;
    mock.method(Order, "find", (f) => ((filter = f), query([])));
    const res = await fetch(`${server.url}/api/orders/my`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    assert.deepEqual(filter.awaitingPayment, { $ne: true });
  });

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

describe("Abandoned checkouts", () => {
  it("are cleaned up by a TTL index on paymentExpiresAt", () => {
    const ttl = Order.schema.indexes().find(([fields]) => "paymentExpiresAt" in fields);
    assert.ok(ttl, "TTL index declared");
    assert.equal(ttl[1].expireAfterSeconds, 0);
  });
});
