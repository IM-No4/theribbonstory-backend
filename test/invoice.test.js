import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { mock, query, startServer, fakeUser, authAs } from "./helpers.js";
import User from "../src/models/User.js";
import Order from "../src/models/Order.js";
import Counter from "../src/models/Counter.js";
import { taxBreakup, assignInvoiceNumber, renderInvoicePdf, financialYear } from "../src/services/invoiceService.js";

let server;
let customer;
let order;
let counter;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});

const ENV = ["INVOICE_GSTIN", "INVOICE_SELLER_STATE", "INVOICE_GST_RATE", "INVOICE_HSN"];
beforeEach(() => {
  customer = fakeUser();
  order = {
    _id: new mongoose.Types.ObjectId(),
    user: customer._id,
    paymentMethod: "cod",
    status: "confirmed",
    createdAt: new Date("2026-10-08T06:00:00Z"),
    shippingAddress: { name: "Asha", line1: "1 Road", city: "Pune", state: "Maharashtra", postalCode: "411001", phone: "9999999999" },
    items: [{ name: "Couple Figurine", price: 1299, quantity: 1, customization: { customName: "Riya & Arjun" } }],
    itemsPrice: 1299,
    shippingPrice: 0,
    discountPrice: 0,
    totalPrice: 1299,
  };
  counter = 41;
  mock.method(Counter, "findOneAndUpdate", async () => ({ seq: ++counter }));
  mock.method(Order, "updateOne", async (f, u) => {
    if (order.invoice?.number) return { modifiedCount: 0 };
    order.invoice = u.$set.invoice;
    return { modifiedCount: 1 };
  });
  mock.method(Order, "findById", () => query(order));
});
afterEach(() => {
  mock.restoreAll();
  for (const k of ENV) delete process.env[k];
});

describe("GST tax breakup", () => {
  it("splits GST-inclusive totals into CGST + SGST within the seller's state", () => {
    const t = taxBreakup(1180, { rate: 18, gstin: "27ABCDE1234F1Z5", sellerState: "Maharashtra", buyerState: " maharashtra" });
    assert.deepEqual(t, { taxable: 1000, cgst: 90, sgst: 90, igst: 0, intraState: true, rate: 18 });
  });
  it("uses IGST for other states", () => {
    const t = taxBreakup(1299, { rate: 18, gstin: "27ABCDE1234F1Z5", sellerState: "Maharashtra", buyerState: "Karnataka" });
    assert.equal(t.taxable, 1100.85);
    assert.equal(t.igst, 198.15);
    assert.equal(t.cgst + t.sgst, 0);
  });
  it("shows no tax when the seller isn't GST-registered", () => {
    assert.deepEqual(taxBreakup(1299, { rate: 18, gstin: "" }), { taxable: 1299, cgst: 0, sgst: 0, igst: 0, intraState: true, rate: 0 });
  });
});

describe("Invoice numbers", () => {
  it("are sequential per financial year and assigned once", async () => {
    const first = await assignInvoiceNumber(order);
    assert.match(first.number, new RegExp(`^TRS/${financialYear(new Date())}/0042$`));
    const again = await assignInvoiceNumber(order);
    assert.equal(again.number, first.number);
    assert.equal(counter, 42, "no number wasted on a repeat call");
  });
  it("aren't given to unpaid online orders", async () => {
    order.paymentMethod = "razorpay";
    order.isPaid = false;
    assert.equal(await assignInvoiceNumber(order), null);
  });
});

describe("Invoice download", () => {
  const download = (token, id = order._id) => fetch(`${server.url}/api/orders/${id}/invoice`, { headers: { Authorization: `Bearer ${token}` } });

  it("gives the customer a PDF of their own order", async () => {
    const res = await download(authAs(User, customer));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.match(res.headers.get("content-disposition"), /invoice-TRS-\d{4}-\d{2}-0042\.pdf/);
    const pdf = Buffer.from(await res.arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  });

  it("is refused for someone else's order and before payment", async () => {
    assert.equal((await download(authAs(User, fakeUser()))).status, 403);
    order.paymentMethod = "razorpay";
    order.awaitingPayment = true;
    const res = await download(authAs(User, customer));
    assert.equal(res.status, 400);
    assert.equal((await download(authAs(User, customer), "not-an-id")).status, 400);
  });

  it("renders a GST invoice with the tax lines when a GSTIN is set", async () => {
    process.env.INVOICE_GSTIN = "27abcde1234f1z5";
    process.env.INVOICE_SELLER_STATE = "Maharashtra";
    process.env.INVOICE_HSN = "3926";
    order.invoice = { number: "TRS/2026-27/0007", date: new Date() };
    const pdf = await renderInvoicePdf(order);
    assert.ok(pdf.length > 1000);
  });
});
