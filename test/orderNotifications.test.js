import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { mock, query, startServer, fakeUser, authAs, mockRes } from "./helpers.js";
import User from "../src/models/User.js";
import Order from "../src/models/Order.js";
import Product from "../src/models/Product.js";
import { getTransporter } from "../src/services/emailService.js";
import { handleWebhook } from "../src/controllers/shippingController.js";

let server;
let token;
let order;
let sent;

before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});

beforeEach(() => {
  token = authAs(User, fakeUser({ role: "admin" }));
  const productId = new mongoose.Types.ObjectId();
  order = {
    _id: new mongoose.Types.ObjectId(),
    status: "processing",
    user: { name: "Asha", email: "asha@example.com" },
    shippingAddress: { name: "Asha", city: "Pune", state: "MH", postalCode: "411001" },
    items: [{ product: productId, name: "Couple Figurine", quantity: 1, price: 1299 }],
    courierPartner: "BlueDart Express (Shiprocket)", // schema default, not a real shipment
    async save() {
      return this;
    },
  };
  mock.method(Order, "findById", () => query(order));
  mock.method(Order, "findOne", () => query(order));
  mock.method(Order, "updateOne", async (f, u) => {
    for (const [k, v] of Object.entries(u.$set)) {
      const [, field] = k.split(".");
      order.notifications = { ...order.notifications, [field]: v };
    }
  });
  mock.method(Product, "find", () => query([{ _id: productId, slug: "couple-figurine" }]));
  sent = [];
  mock.method(getTransporter("NOREPLY"), "sendMail", async (m) => sent.push(m));
});
afterEach(() => {
  mock.restoreAll();
  delete process.env.SHIPROCKET_WEBHOOK_TOKEN;
});

const setStatus = (body) =>
  fetch(`${server.url}/api/orders/${order._id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
const settle = () => new Promise((r) => setTimeout(r, 30));

describe("Order status emails", () => {
  it("emails the customer once when shipped, with real tracking only", async () => {
    assert.equal((await setStatus({ status: "shipped" })).status, 200);
    await settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "asha@example.com");
    assert.match(sent[0].subject, /has been shipped/);
    assert.ok(!sent[0].html.includes("BlueDart") && !sent[0].html.includes("SR-PENDING"), "no made-up courier");
    assert.match(sent[0].html, new RegExp(`/track-order\\?id=${order._id}`));

    // Admin flips it back and forth: no second email
    await setStatus({ status: "processing" });
    await setStatus({ status: "shipped", trackingNumber: "AWB123" });
    await settle();
    assert.equal(sent.length, 1);
  });

  it("shows the tracking number and courier when the order has them", async () => {
    await setStatus({ status: "shipped", trackingNumber: "AWB987", courierPartner: "Delhivery" });
    await settle();
    assert.match(sent[0].html, /AWB987/);
    assert.match(sent[0].html, /Delhivery/);
  });

  it("emails once on delivery with a review link to the product", async () => {
    order.status = "shipped";
    await setStatus({ status: "delivered" });
    await settle();
    assert.equal(sent.length, 1, "one email, not a separate review request");
    assert.match(sent[0].subject, /Delivered/);
    assert.match(sent[0].html, /\/product\/couple-figurine\?review=1/);
    await setStatus({ status: "shipped" });
    await setStatus({ status: "delivered" });
    await settle();
    assert.equal(sent.filter((m) => /Delivered/.test(m.subject)).length, 1);
  });
});

describe("Shiprocket tracking updates", () => {
  const hook = async (current_status) => {
    process.env.SHIPROCKET_WEBHOOK_TOKEN = "t";
    const res = mockRes();
    await handleWebhook({ headers: { "x-api-key": "t" }, body: { awb: "AWB1", current_status } }, res);
    await settle();
    return res;
  };

  it("marks delivered and emails the customer", async () => {
    order.status = "shipped";
    await hook("DELIVERED");
    assert.equal(order.status, "delivered");
    assert.equal(sent.length, 1);
  });

  it("never moves a delivered order back to shipped on a late courier event", async () => {
    order.status = "delivered";
    await hook("IN TRANSIT");
    assert.equal(order.status, "delivered");
  });

  it("does not treat failed or returned deliveries as delivered", async () => {
    order.status = "shipped";
    await hook("UNDELIVERED");
    await hook("RTO DELIVERED");
    assert.equal(order.status, "shipped");
    assert.equal(sent.length, 0);
  });
});

describe("Order confirmation email", () => {
  it("shows the customer's approved 3D design and inscription", async () => {
    const { sendOrderConfirmationEmail } = await import("../src/services/emailService.js");
    order.itemsPrice = order.totalPrice = 1299;
    order.shippingPrice = 0;
    order.items[0].customization = {
      customName: "Riya & Arjun",
      customDate: "14.02.2020",
      note: "Riya & Arjun",
      reference3D: { approvedPreview: "/uploads/3d_references/ref_1/front-2.png" },
    };
    await sendOrderConfirmationEmail({ order, userEmail: "asha@example.com" });
    const html = sent[0].html;
    assert.match(html, /src="https:\/\/backend\.theribbonstory\.com\/uploads\/3d_references\/ref_1\/front-2\.png"/);
    assert.match(html, /Inscription: <strong>Riya &amp; Arjun · 14\.02\.2020<\/strong>/);
    assert.equal(html.match(/Riya &amp; Arjun/g).length, 1, "note that repeats the inscription isn't shown twice");
  });
});
