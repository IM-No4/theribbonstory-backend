import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { mock, query, startServer } from "./helpers.js";
import AnalyticsEvent from "../src/models/AnalyticsEvent.js";
import Order from "../src/models/Order.js";
import { cleanPath, deviceType } from "../src/services/analyticsIngest.js";
import { reportWindow } from "../src/services/analyticsReport.js";

const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148";
const ids = { visitorId: "visitor-12345678", sessionId: "session-12345678" };

let server;
let saved;
let upserts;
before(async () => (server = await startServer()));
after(() => server.close());
beforeEach(() => {
  saved = [];
  upserts = [];
  mock.method(AnalyticsEvent, "insertMany", async (docs) => saved.push(...docs));
  mock.method(AnalyticsEvent, "updateOne", async (filter, update) => upserts.push({ filter, update }));
  mock.method(Order, "findById", () => query({ totalPrice: 398 }));
});
afterEach(() => mock.restoreAll());

const collect = (payload, userAgent = BROWSER) =>
  fetch(`${server.url}/api/insights/collect`, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "User-Agent": userAgent, Origin: "https://theribbonstory.com" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });

describe("Analytics collection", () => {
  it("stores events with the visit's source and device", async () => {
    const res = await collect({ ...ids, source: "Instagram", medium: "paid", campaign: "Xmas", events: [{ type: "page_view", path: "/shop?x=1" }] });
    assert.equal(res.status, 204);
    assert.equal(saved.length, 1);
    assert.deepEqual(
      [saved[0].source, saved[0].medium, saved[0].campaign, saved[0].device, saved[0].path],
      ["instagram", "paid", "xmas", "mobile", "/shop"]
    );
  });

  it("ignores bots, unknown event types, bad IDs and broken bodies", async () => {
    await collect({ ...ids, events: [{ type: "page_view", path: "/" }] }, "Googlebot/2.1");
    await collect({ ...ids, events: [{ type: "something_else" }] });
    await collect({ visitorId: "x", sessionId: "y", events: [{ type: "page_view" }] });
    assert.equal((await collect("not json")).status, 204);
    assert.equal(saved.length, 0);
  });

  it("removes personal data from click text", async () => {
    await collect({ ...ids, events: [{ type: "click", label: "Call +91 98765 43210 or a@b.com", path: "/contact" }] });
    assert.equal(saved[0].label, "Call [number] or [email]");
  });

  it("takes the purchase amount from the order, not the browser", async () => {
    const orderId = String(new mongoose.Types.ObjectId());
    await collect({ ...ids, events: [{ type: "purchase", orderId, value: 999999 }] });
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].update.$setOnInsert.value, 398);
    assert.equal(upserts[0].filter.orderId, orderId);
  });

  it("keeps order IDs and reset tokens out of page paths", () => {
    assert.equal(cleanPath("/order-success/6aa701d0c08b9050fe11b696"), "/order-success/:id");
    assert.equal(cleanPath("/reset-password/abc123secret"), "/reset-password/:id");
    assert.equal(cleanPath("/product/christmas-village-key-tray"), "/product/christmas-village-key-tray");
    assert.equal(deviceType("Mozilla/5.0 (Windows NT 10.0)"), "desktop");
  });

  it("starts report days at midnight India time", () => {
    const w = reportWindow("7d", new Date("2026-11-27T20:00:00Z")); // 28 Nov, 01:30 IST
    assert.equal(w.from.toISOString(), "2026-11-21T18:30:00.000Z");
    assert.equal(w.previousFrom.toISOString(), "2026-11-14T18:30:00.000Z");
  });

  it("only admins can read the report", async () => {
    const res = await fetch(`${server.url}/api/admin/analytics`);
    assert.equal(res.status, 401);
  });
});
