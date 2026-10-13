import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";

const getJson = async (path) => {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    const json = await res.json();
    return { status: res.status, json };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("Public Config Endpoint", async (t) => {
  await t.test("GET /api/config returns safe public config", async () => {
    const { status, json } = await getJson("/api/config");
    assert.equal(status, 200);
    assert.equal(typeof json.comingSoon, "boolean");
    assert.equal(typeof json.googleClientId, "string");
    assert.equal(typeof json.razorpayKeyId, "string");
    // Ensure secrets are NEVER exposed
    assert.equal(json.GOOGLE_CLIENT_SECRET, undefined);
    assert.equal(json.googleClientSecret, undefined);
    assert.equal(json.JWT_SECRET, undefined);
    assert.equal(json.jwtSecret, undefined);
    assert.equal(json.RAZORPAY_KEY_SECRET, undefined);
    assert.equal(json.razorpayKeySecret, undefined);
  });
});
