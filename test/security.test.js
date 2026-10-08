import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mock, startServer, fakeUser, authAs, mockRes } from "./helpers.js";
import User from "../src/models/User.js";
import { resolveUploadedImagePath } from "../src/services/gemini3dAgent.js";
import { verifyUploadedImages } from "../src/middleware/upload.js";
import { handleWebhook } from "../src/controllers/shippingController.js";
import { escapeHtml, escapeRegex, safeEqual, getJwtSecret } from "../src/utils/security.js";

const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads");
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});
afterEach(() => mock.restoreAll());

describe("3D agent photo path resolution", () => {
  it("never resolves outside the uploads folder", () => {
    for (const url of [
      ".env",
      "../.env",
      "/etc/passwd",
      "/../../../../etc/passwd",
      "/uploads/../.env",
      "/uploads/..%2f..%2fetc%2fpasswd",
      "/uploads/../../../../etc/passwd.jpg",
      "file:///etc/passwd",
      "/uploads/%2e%2e/package.json",
    ]) {
      assert.equal(resolveUploadedImagePath(url), null, url);
    }
  });

  it("only resolves image files", () => {
    assert.equal(resolveUploadedImagePath("/uploads/.gitkeep"), null);
  });

  it("resolves a real uploaded image by path or absolute URL", () => {
    const file = path.join(uploadsDir, "resolver-test.jpg");
    fs.writeFileSync(file, "x");
    try {
      assert.equal(resolveUploadedImagePath("/uploads/resolver-test.jpg"), file);
      assert.equal(resolveUploadedImagePath("https://backend.example.com/uploads/resolver-test.jpg"), file);
    } finally {
      fs.unlinkSync(file);
    }
  });
});

describe("Upload content verification", () => {
  it("rejects and deletes a non-image renamed to .jpg", async () => {
    const file = path.join(uploadsDir, "evil-test.jpg");
    fs.writeFileSync(file, "<html><script>alert(1)</script></html>");
    const res = mockRes();
    let nextCalled = false;
    verifyUploadedImages({ file: { path: file } }, res, () => (nextCalled = true));
    assert.equal(res.statusCode, 400);
    assert.equal(nextCalled, false);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(fs.existsSync(file), false);
  });

  it("accepts a real PNG", () => {
    const file = path.join(uploadsDir, "ok-test.png");
    fs.writeFileSync(file, PNG_HEADER);
    try {
      let nextCalled = false;
      verifyUploadedImages({ file: { path: file } }, mockRes(), () => (nextCalled = true));
      assert.equal(nextCalled, true);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it("POST /api/upload rejects HTML disguised as an image", async () => {
    const token = authAs(User, fakeUser());
    const form = new FormData();
    form.append("photo", new Blob(["<svg onload=alert(1)>"], { type: "image/png" }), "x.png");
    const res = await fetch(`${server.url}/api/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    assert.equal(res.status, 400);
  });

  it("POST /api/upload accepts a real image", async () => {
    const token = authAs(User, fakeUser());
    const form = new FormData();
    form.append("photo", new Blob([PNG_HEADER], { type: "image/png" }), "x.png");
    const res = await fetch(`${server.url}/api/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    assert.equal(res.status, 201);
    const { url } = await res.json();
    fs.unlinkSync(path.join(uploadsDir, path.basename(url)));
  });
});

describe("Shiprocket webhook", () => {
  const body = { awb: "123", current_status: "DELIVERED" };

  it("is rejected when no token is configured", async () => {
    delete process.env.SHIPROCKET_WEBHOOK_TOKEN;
    const res = mockRes();
    await handleWebhook({ headers: {}, body }, res);
    assert.equal(res.statusCode, 503);
  });

  it("is rejected with a wrong token", async () => {
    process.env.SHIPROCKET_WEBHOOK_TOKEN = "correct-token";
    const res = await fetch(`${server.url}/api/shipping/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "wrong-token" },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 401);
    delete process.env.SHIPROCKET_WEBHOOK_TOKEN;
  });
});

describe("CORS", () => {
  it("does not allow unknown origins", async () => {
    const res = await fetch(`${server.url}/api/health`, { headers: { Origin: "https://evil.example" } });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  it("allows the storefront origin", async () => {
    const res = await fetch(`${server.url}/api/health`, { headers: { Origin: "https://theribbonstory.com" } });
    assert.equal(res.headers.get("access-control-allow-origin"), "https://theribbonstory.com");
  });
});

describe("Error handling", () => {
  it("hides internal error messages outside development", async () => {
    const res = await fetch(`${server.url}/api/products/admin/all`, { headers: { Authorization: "Bearer not-a-jwt" } });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).stack, undefined);
  });
});

describe("Security helpers", () => {
  it("escapeHtml neutralises markup", () => {
    assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
    assert.equal(escapeHtml(undefined), "");
  });

  it("escapeRegex makes patterns literal", () => {
    assert.ok(new RegExp(`^${escapeRegex("a.*(b)")}$`).test("a.*(b)"));
    assert.ok(!new RegExp(`^${escapeRegex(".*")}$`).test("anything"));
  });

  it("safeEqual compares strings", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("abc", undefined), false);
  });

  it("getJwtSecret refuses weak or missing secrets in production", () => {
    const saved = { env: process.env.NODE_ENV, secret: process.env.JWT_SECRET };
    try {
      process.env.NODE_ENV = "production";
      delete process.env.JWT_SECRET;
      assert.throws(() => getJwtSecret(), /JWT_SECRET/);
      process.env.JWT_SECRET = "replace-this-with-a-long-random-secret";
      assert.throws(() => getJwtSecret(), /JWT_SECRET/);
      process.env.JWT_SECRET = "short";
      assert.throws(() => getJwtSecret(), /JWT_SECRET/);
      process.env.JWT_SECRET = "x".repeat(48);
      assert.equal(getJwtSecret(), "x".repeat(48));
    } finally {
      process.env.NODE_ENV = saved.env;
      if (saved.secret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = saved.secret;
    }
  });
});
