import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { mock, query, startServer, fakeUser, authAs } from "./helpers.js";
import User from "../src/models/User.js";
import Order from "../src/models/Order.js";
import { csvCell } from "../src/services/ordersExport.js";

let server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});
afterEach(() => {
  mock.restoreAll();
  delete process.env.INVOICE_GSTIN;
  delete process.env.INVOICE_SELLER_STATE;
});

const sample = {
  _id: new mongoose.Types.ObjectId(),
  createdAt: new Date("2026-10-07T19:00:00Z"), // 00:30 on 8 Oct IST
  status: "delivered",
  paymentMethod: "cod",
  isPaid: true,
  invoice: { number: "TRS/2026-27/0042" },
  user: { name: "Asha", email: "asha@example.com" },
  shippingAddress: { name: "=HYPERLINK(\"http://evil\")", line1: "1, Rose Lane", city: "Pune", state: "Maharashtra", postalCode: "411001", phone: "+919999999999" },
  items: [{ name: "Couple \"Forever\" Figurine", quantity: 2, price: 1299, customization: { customName: "Riya & Arjun" } }],
  itemsPrice: 2598,
  discountPrice: 100,
  couponCode: "LOVE100",
  shippingPrice: 0,
  totalPrice: 2498,
};

const exportCsv = (qs, token) =>
  fetch(`${server.url}/api/orders/admin/export${qs}`, { headers: { Authorization: `Bearer ${token}` } });

describe("Orders CSV export", () => {
  it("exports placed orders for an India-time date range", async () => {
    process.env.INVOICE_GSTIN = "27ABCDE1234F1Z5";
    process.env.INVOICE_SELLER_STATE = "Maharashtra";
    let filter;
    mock.method(Order, "find", (f) => ((filter = f), query([sample])));
    const res = await exportCsv("?from=2026-10-08&to=2026-10-08&status=delivered", authAs(User, fakeUser({ role: "admin" })));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/csv/);
    assert.match(res.headers.get("content-disposition"), /orders-2026-10-08-to-2026-10-08-delivered\.csv/);
    assert.equal(res.headers.get("x-order-count"), "1");

    assert.equal(filter.createdAt.$gte.toISOString(), "2026-10-07T18:30:00.000Z");
    assert.equal(filter.createdAt.$lt.toISOString(), "2026-10-08T18:30:00.000Z");
    assert.equal(filter.status, "delivered");
    assert.deepEqual(filter.awaitingPayment, { $ne: true });

    const bytes = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM for Excel");
    const text = bytes.subarray(3).toString("utf8");
    assert.ok(text.startsWith("Order ID,"));
    const row = text.split("\r\n")[1];
    assert.match(row, /2026-10-08 00:30/);
    assert.match(row, /TRS\/2026-27\/0042/);
    assert.match(row, /"'=HYPERLINK\(""http:\/\/evil""\)"/, "formula neutralised and quoted");
    assert.match(row, /"Couple ""Forever"" Figurine x2 \[Riya & Arjun\]"/);
    assert.match(row, /'\+919999999999/);
    assert.match(row, /,2498,2116\.95,190\.53,190\.52,0,/, "GST split of the total");
  });

  it("rejects bad dates and statuses, and non-admins", async () => {
    mock.method(Order, "find", () => query([]));
    const adminToken = authAs(User, fakeUser({ role: "admin" }));
    assert.equal((await exportCsv("?from=08-10-2026", adminToken)).status, 400);
    assert.equal((await exportCsv("?status=lost", adminToken)).status, 400);
    mock.restoreAll();
    assert.equal((await exportCsv("", authAs(User, fakeUser()))).status, 403);
  });

  it("keeps numbers as numbers and quotes text safely", () => {
    assert.equal(csvCell(-200), "-200");
    assert.equal(csvCell("-200"), "'-200");
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell(null), "");
  });
});
