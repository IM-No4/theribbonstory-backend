import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import mongoose from "mongoose";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { mock, query, startServer, fakeUser, authAs } from "./helpers.js";
import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import Coupon from "../src/models/Coupon.js";
import Order from "../src/models/Order.js";
import Reference3D from "../src/models/Reference3D.js";

const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads");
const refDir = path.join(uploadsDir, "3d_references");
const PRODUCT_ID = new mongoose.Types.ObjectId().toString();

let server;
let geminiCalls;
let sessions;
let user;
let token;
let created;
let clientIp = 0;
const ip = () => ({ "X-Forwarded-For": `10.0.0.${clientIp}` });

before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});

/** In-memory Reference3D collection with save() */
const stubSessions = () => {
  sessions = new Map();
  mock.method(Reference3D, "create", async (doc) => {
    const record = {
      _id: new mongoose.Types.ObjectId(),
      previewAttempts: 0,
      previewIsReal: false,
      views: {},
      generationLogs: [],
      ...doc,
      async save() {
        return this;
      },
    };
    sessions.set(record.sessionId, record);
    return record;
  });
  mock.method(Reference3D, "findOne", (f) => query(sessions.get(f.sessionId) || null));
  mock.method(Reference3D, "updateOne", async (f, u) => {
    const record = [...sessions.values()].find((r) => String(r._id) === String(f._id));
    if (record && !record.userId) Object.assign(record, u.$set);
    return { modifiedCount: record ? 1 : 0 };
  });
};

/** Fake Gemini image model: returns a generated PNG and records what it was sent */
const fakeGemini = async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const png = (await sharp({ create: { width: 64, height: 64, channels: 3, background: "#e8b4c0" } }).png().toBuffer()).toString("base64");
  mock.method(GoogleGenerativeAI.prototype, "getGenerativeModel", () => ({
    generateContent: async (parts) => {
      geminiCalls.push(parts);
      return { response: { candidates: [{ content: { parts: [{ inlineData: { data: png, mimeType: "image/png" } }] } }] } };
    },
  }));
};

const photo = () =>
  sharp({ create: { width: 1200, height: 900, channels: 3, background: "#7a5c4e" } }).jpeg().toBuffer();

const uploadPreview = async (headers = {}) => {
  const form = new FormData();
  form.append("photo", new Blob([await photo()], { type: "image/jpeg" }), "family.jpg");
  return fetch(`${server.url}/api/3d-agent/preview`, { method: "POST", headers: { ...ip(), ...headers }, body: form });
};

const regenerate = (sessionId) =>
  fetch(`${server.url}/api/3d-agent/preview/${sessionId}/regenerate`, { method: "POST", headers: ip() });

beforeEach(async () => {
  clientIp += 1; // each test is its own visitor for the per-IP preview limit
  geminiCalls = [];
  created = null;
  user = fakeUser();
  token = authAs(User, user);
  stubSessions();
  await fakeGemini();
});
afterEach(() => {
  mock.restoreAll();
  delete process.env.GEMINI_API_KEY;
  for (const sid of sessions.keys()) fs.rmSync(path.join(refDir, sid), { recursive: true, force: true });
});

describe("Customer 3D preview", () => {
  it("turns an uploaded photo into one front-view preview (a single Gemini call)", async () => {
    const res = await uploadPreview();
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.previewAvailable, true);
    assert.match(body.previewUrl, new RegExp(`^/uploads/3d_references/${body.sessionId}/front-1\\.png$`));
    assert.match(body.originalUrl, /original\.webp$/, "photo was optimised (EXIF/GPS stripped) before use");
    assert.equal(body.attemptsLeft, 2);

    assert.equal(geminiCalls.length, 1, "front view only");
    const [promptPart, photoPart] = geminiCalls[0];
    assert.match(promptPart.text, /PHYSICALLY PLA-PRINTABLE/);
    assert.equal(photoPart.inlineData.mimeType, "image/webp", "real image type sent to Gemini");
    assert.ok(fs.existsSync(path.join(refDir, body.sessionId, "front-1.png")));
  });

  it("regenerating keeps earlier attempts and stops after 3", async () => {
    const { sessionId } = await (await uploadPreview()).json();
    let res = await regenerate(sessionId);
    let body = await res.json();
    assert.match(body.previewUrl, /front-2\.png$/);
    assert.equal(body.attemptsLeft, 1);
    assert.ok(fs.existsSync(path.join(refDir, sessionId, "front-1.png")), "earlier attempt kept");

    body = await (await regenerate(sessionId)).json();
    assert.equal(body.attemptsLeft, 0);
    res = await regenerate(sessionId);
    assert.equal(res.status, 429);
    assert.equal(geminiCalls.length, 3);
  });

  it("never presents a placeholder as the customer's design when Gemini is unavailable", async () => {
    mock.restoreAll();
    stubSessions();
    delete process.env.GEMINI_API_KEY;
    const body = await (await uploadPreview()).json();
    assert.equal(body.previewAvailable, false);
    assert.equal(body.previewUrl, null);
  });

  it("a failed retry keeps the customer's current design and doesn't use up an attempt", async () => {
    const { sessionId, previewUrl } = await (await uploadPreview()).json();
    delete process.env.GEMINI_API_KEY; // image model goes down
    const res = await regenerate(sessionId);
    assert.equal(res.status, 503);
    const record = sessions.get(sessionId);
    assert.equal(record.previewIsReal, true);
    assert.equal(record.views.front.url, previewUrl);
    assert.equal(record.previewAttempts, 1);
    assert.equal(record.status, "preview_ready");
  });

  it("unknown sessions can't be regenerated", async () => {
    const res = await regenerate("ref_missing");
    assert.equal(res.status, 404);
  });

  it("the full 4-view generator is admin-only", async () => {
    const form = new FormData();
    form.append("photo", new Blob([await photo()], { type: "image/jpeg" }), "x.jpg");
    const res = await fetch(`${server.url}/api/3d-agent/generate`, { method: "POST", body: form });
    assert.equal(res.status, 401);
  });
});

describe("Ordering an approved 3D design", () => {
  const address = { name: "A", line1: "1 Road", city: "Pune", postalCode: "411001", phone: "9999999999" };
  let orders;

  beforeEach(() => {
    const product = { _id: PRODUCT_ID, name: "Custom Figurine", price: 1299, isActive: true, images: [], optionGroups: [], stock: 50 };
    mock.method(Product, "find", () => query([product]));
    mock.method(Product, "findOne", () => query(product));
    mock.method(Product, "updateOne", async () => ({ modifiedCount: 1 }));
    mock.method(Coupon, "findOne", () => query(null));
    orders = new Map();
    mock.method(Order, "create", async (doc) => {
      created = {
        _id: new mongoose.Types.ObjectId(),
        ...structuredClone(doc),
        markModified() {},
        async save() {
          return this;
        },
      };
      orders.set(String(created._id), created);
      return created;
    });
    mock.method(Order, "findById", (id) => query(orders.get(String(id)) || null));
  });

  /** Wait for the background reference pack so cleanup doesn't delete files mid-run */
  const packSettled = async (ref) => {
    for (let i = 0; i < 100 && ref.status !== "completed"; i += 1) await new Promise((r) => setTimeout(r, 20));
  };

  const order = (customization) =>
    fetch(`${server.url}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        paymentMethod: "cod",
        shippingAddress: address,
        items: [{ productId: `${PRODUCT_ID}-classic`, sizeId: "classic", quantity: 1, image: "data:image/png;base64,AAAA", customization }],
      }),
    });

  it("records the exact preview the customer approved, then builds the reference pack from it", async () => {
    const { sessionId, previewUrl: first } = await (await uploadPreview()).json();
    await regenerate(sessionId); // customer looked at another take, then went back to the first
    geminiCalls = [];

    const res = await order({
      photoUrl: "data:image/jpeg;base64,/9j/HUGE",
      customName: "Riya & Arjun",
      customDate: "14.02.2020",
      reference3D: { sessionId, approvedPreview: first },
    });
    assert.equal(res.status, 201);

    const item = created.items[0];
    const ref = item.customization.reference3D;
    assert.equal(ref.approvedPreview, first, "the approved attempt, not the latest");
    assert.equal(ref.status, "approved");
    assert.equal(item.image, first);
    assert.match(item.customization.photoUrl, /original\.webp$/, "photo taken from the session, not the browser");
    assert.equal(item.customization.customName, "Riya & Arjun");
    assert.equal(item.customization.customDate, "14.02.2020");
    assert.equal(sessions.get(sessionId).userId, user._id, "session claimed by the customer");

    // Background: left, right and back generated from the approved front view
    await packSettled(ref);
    assert.equal(ref.status, "completed");
    assert.equal(geminiCalls.length, 3);
    for (const parts of geminiCalls) {
      const frontRef = parts.find((p) => p.inlineData && p.inlineData.mimeType === "image/png");
      const approvedBytes = fs.readFileSync(path.join(uploadsDir, first.replace("/uploads/", "")));
      assert.equal(frontRef.inlineData.data, approvedBytes.toString("base64"), "every view anchored to the approved front");
    }
    assert.ok(ref.zipUrl.endsWith(".zip"));
    assert.ok(fs.existsSync(path.join(uploadsDir, ref.zipUrl.replace("/uploads/", ""))));
  });

  it("ignores an approved image that isn't from this session", async () => {
    const { sessionId, previewUrl } = await (await uploadPreview()).json();
    const res = await order({ reference3D: { sessionId, approvedPreview: "/uploads/someone-else.webp" } });
    assert.equal(res.status, 201);
    const ref = created.items[0].customization.reference3D;
    assert.equal(ref.approvedPreview, previewUrl);
    await packSettled(ref);
  });

  it("refuses placeholder previews and other customers' sessions", async () => {
    const { sessionId } = await (await uploadPreview()).json();
    sessions.get(sessionId).previewIsReal = false;
    let res = await order({ reference3D: { sessionId } });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /preview has expired/);

    sessions.get(sessionId).previewIsReal = true;
    sessions.get(sessionId).userId = new mongoose.Types.ObjectId();
    res = await order({ reference3D: { sessionId } });
    assert.equal(res.status, 400);
  });

  it("drops photos and images that aren't hosted files", async () => {
    const res = await order({ photoUrl: "data:image/jpeg;base64,/9j/HUGE", note: "Make it cute" });
    assert.equal(res.status, 201);
    assert.equal(created.items[0].customization.photoUrl, undefined);
    assert.equal(created.items[0].image, undefined);
    assert.equal(created.items[0].customization.note, "Make it cute");
  });
});
