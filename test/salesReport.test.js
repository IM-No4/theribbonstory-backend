import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mock, query, startServer, fakeUser, authAs } from "./helpers.js";
import User from "../src/models/User.js";
import Order from "../src/models/Order.js";
import { salesReport } from "../src/services/salesReport.js";

let server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});
afterEach(() => mock.restoreAll());

// 8 Oct 2026, 15:00 IST
const NOW = Date.parse("2026-10-08T09:30:00Z");
const at = (iso) => new Date(iso);
const order = (createdAt, totalPrice, extra = {}) => ({
  createdAt: at(createdAt),
  totalPrice,
  paymentMethod: "razorpay",
  status: "confirmed",
  items: [{ name: "Couple Figurine", quantity: 1, price: totalPrice }],
  ...extra,
});

describe("Sales report", () => {
  it("adds up real sales by Indian day, payment type and product", async () => {
    const current = [
      order("2026-10-08T03:00:00Z", 1299), // 8 Oct IST
      order("2026-10-07T19:00:00Z", 699, { paymentMethod: "cod", items: [{ name: "Mini", quantity: 1, price: 699 }] }), // 00:30 on 8 Oct IST
      order("2026-10-07T10:00:00Z", 2598, { items: [{ name: "Couple Figurine", quantity: 2, price: 1299 }], status: "delivered" }),
      order("2026-10-06T10:00:00Z", 999, { status: "cancelled" }),
      order("2026-10-05T10:00:00Z", 500, { isRefunded: true, refundStatus: "refunded", refundAmount: 500 }),
    ];
    const previous = [order("2026-09-28T10:00:00Z", 1000), order("2026-09-29T10:00:00Z", 300, { status: "cancelled" })];
    const filters = [];
    mock.method(Order, "find", (f) => (filters.push(f), query(filters.length === 1 ? current : previous)));

    const r = await salesReport("7d", NOW);

    assert.equal(r.revenue, 1299 + 699 + 2598, "cancelled and refunded orders aren't revenue");
    assert.equal(r.orders, 3);
    assert.equal(r.averageOrderValue, Math.round(4596 / 3));
    assert.deepEqual(r.previous, { revenue: 1000, orders: 1 });
    assert.equal(r.from.toISOString(), "2026-10-01T18:30:00.000Z", "7 days back to IST midnight on 2 Oct");
    assert.equal(r.byDay.length, 7);
    assert.deepEqual(r.byDay.at(-1), { date: "2026-10-08", revenue: 1998, orders: 2 }, "00:30 IST counts as the 8th");
    assert.deepEqual(r.byDay.at(-2), { date: "2026-10-07", revenue: 2598, orders: 1 });
    assert.deepEqual(r.paymentSplit, { cod: { orders: 1, revenue: 699 }, online: { orders: 2, revenue: 3897 } });
    assert.deepEqual(r.topProducts.map((p) => [p.name, p.quantity, p.revenue]), [["Couple Figurine", 3, 3897], ["Mini", 1, 699]]);
    assert.equal(r.fulfilment.toMake, 3);
    assert.equal(r.fulfilment.delivered, 1);
    assert.equal(r.fulfilment.cancelled, 1);
    assert.equal(r.refunded, 500);
    assert.deepEqual(filters[0].awaitingPayment, { $ne: true }, "abandoned online checkouts excluded");
  });

  it("'today' starts at midnight India time", async () => {
    mock.method(Order, "find", () => query([]));
    const r = await salesReport("today", NOW);
    assert.equal(r.from.toISOString(), "2026-10-07T18:30:00.000Z");
    assert.deepEqual(r.byDay, [{ date: "2026-10-08", revenue: 0, orders: 0 }]);
  });

  it("is admin-only and falls back to 7 days for unknown ranges", async () => {
    mock.method(Order, "find", () => query([]));
    let res = await fetch(`${server.url}/api/orders/admin/sales`);
    assert.equal(res.status, 401);
    const customer = authAs(User, fakeUser());
    res = await fetch(`${server.url}/api/orders/admin/sales`, { headers: { Authorization: `Bearer ${customer}` } });
    assert.equal(res.status, 403);
    mock.restoreAll();
    mock.method(Order, "find", () => query([]));
    const adminToken = authAs(User, fakeUser({ role: "admin" }));
    res = await fetch(`${server.url}/api/orders/admin/sales?range=forever`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.range, "7d");
    assert.equal(body.byDay.length, 7);
  });
});
