import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer, mock, query } from "./helpers.js";
import Order from "../src/models/Order.js";

test("Chibi Routes", async (t) => {
  const { url, close } = await startServer();

  try {
    await t.test("POST /api/chibi/generate returns 400 when no photo or photoUrl is provided", async () => {
      const res = await fetch(`${url}/api/chibi/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    });

    await t.test("POST /api/chibi/orders/:orderId/items/:itemIndex/generate returns 404 for missing order", async () => {
      mock.method(Order, "findById", () => query(null));

      const res = await fetch(`${url}/api/chibi/orders/000000000000000000000000/items/0/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.ok(data.error);
    });
  } finally {
    await close();
  }
});
