import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { mock, query, startServer, fakeUser, authAs } from "./helpers.js";
import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import Order from "../src/models/Order.js";
import { printFilesDir } from "../src/middleware/printFileUpload.js";

const STL = "solid keepsake\n  facet normal 0 0 1\n  endfacet\nendsolid keepsake\n";

let server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});
afterEach(() => mock.restoreAll());

/** A product document with a stubbed save; `printFile` mirrors the select:false field */
const fakeProduct = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  name: "Custom Figurine",
  printFile: undefined,
  save: async () => {},
  ...overrides,
});

const stubProduct = (product) =>
  mock.method(Product, "findById", (id) => query(String(id) === String(product._id) ? product : null));

const upload = (token, productId, name, contents) => {
  const form = new FormData();
  form.append("file", new Blob([contents]), name);
  return fetch(`${server.url}/api/products/${productId}/print-file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
};

describe("Product print files (admin only)", () => {
  it("customers cannot upload or download print files", async () => {
    const token = authAs(User, fakeUser({ role: "customer" }));
    const product = fakeProduct();
    let res = await upload(token, product._id, "model.stl", STL);
    assert.equal(res.status, 403);
    res = await fetch(`${server.url}/api/products/${product._id}/print-file`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403);
  });

  it("anonymous visitors cannot download print files", async () => {
    const res = await fetch(`${server.url}/api/products/${new mongoose.Types.ObjectId()}/print-file`);
    assert.equal(res.status, 401);
  });

  it("stores the file privately and lets an admin download it with its original name", async () => {
    const token = authAs(User, fakeUser({ role: "admin" }));
    const product = fakeProduct();
    stubProduct(product);

    const res = await upload(token, product._id, "Figurine Final.STL", STL);
    assert.equal(res.status, 201);
    const stored = product.printFile;
    assert.equal(stored.originalName, "Figurine Final.STL");
    assert.equal(stored.size, Buffer.byteLength(STL));
    assert.match(stored.filename, /^[0-9a-f]{32}\.stl$/);
    const onDisk = path.join(printFilesDir, stored.filename);
    assert.ok(fs.existsSync(onDisk));
    assert.ok(!onDisk.includes(`${path.sep}uploads${path.sep}`), "not in the public uploads folder");

    // Not reachable through the public static uploads route
    const publicRes = await fetch(`${server.url}/uploads/${stored.filename}`);
    assert.equal(publicRes.status, 404);

    const dl = await fetch(`${server.url}/api/products/${product._id}/print-file`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(dl.status, 200);
    assert.match(dl.headers.get("content-disposition"), /Figurine Final\.STL/);
    assert.match(dl.headers.get("cache-control"), /no-store/);
    assert.equal(await dl.text(), STL);

    fs.unlinkSync(onDisk);
  });

  it("replacing a print file deletes the old one", async () => {
    const token = authAs(User, fakeUser({ role: "admin" }));
    const product = fakeProduct();
    stubProduct(product);

    await upload(token, product._id, "v1.stl", STL);
    const first = path.join(printFilesDir, product.printFile.filename);
    await upload(token, product._id, "v2.3mf", "PK-3mf");
    const second = path.join(printFilesDir, product.printFile.filename);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(fs.existsSync(first), false);
    assert.equal(fs.existsSync(second), true);
    assert.equal(product.printFile.originalName, "v2.3mf");
    fs.unlinkSync(second);
  });

  it("rejects files that are not STL, 3MF or OBJ", async () => {
    const token = authAs(User, fakeUser({ role: "admin" }));
    const product = fakeProduct();
    stubProduct(product);
    const before = fs.readdirSync(printFilesDir).length;
    const res = await upload(token, product._id, "virus.exe", "MZ");
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /\.stl/);
    assert.equal(fs.readdirSync(printFilesDir).length, before);
  });

  it("discards the upload when the product does not exist", async () => {
    const token = authAs(User, fakeUser({ role: "admin" }));
    mock.method(Product, "findById", () => query(null));
    const before = fs.readdirSync(printFilesDir).length;
    const res = await upload(token, new mongoose.Types.ObjectId(), "model.stl", STL);
    assert.equal(res.status, 404);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(fs.readdirSync(printFilesDir).length, before);
  });

  it("delete removes the file and the reference", async () => {
    const token = authAs(User, fakeUser({ role: "admin" }));
    const product = fakeProduct();
    stubProduct(product);
    await upload(token, product._id, "model.obj", "o cube");
    const onDisk = path.join(printFilesDir, product.printFile.filename);

    const res = await fetch(`${server.url}/api/products/${product._id}/print-file`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.equal(product.printFile, undefined);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(fs.existsSync(onDisk), false);
  });

  it("customer queries exclude print files at the database; admin queries opt in", () => {
    const projection = (q) => (q._applyPaths(), q._fields);
    assert.deepEqual(projection(Product.findOne({ slug: "x" })), { printFile: 0 });
    assert.deepEqual(projection(Product.find({ isActive: true })), { printFile: 0 });
    assert.deepEqual(projection(Product.find({}).select("+printFile")), {});
  });
});

describe("Print files on admin order views", () => {
  it("marks catalog items whose product has a print file, not placeholder-linked items", async () => {
    const token = authAs(User, fakeUser({ role: "admin" }));
    const withFile = new mongoose.Types.ObjectId();
    const placeholder = new mongoose.Types.ObjectId();
    const order = {
      _id: new mongoose.Types.ObjectId(),
      items: [
        { product: withFile, name: "Figurine", fromCatalog: true },
        { product: placeholder, name: "Custom Hamper", fromCatalog: false },
        { product: withFile, name: "Legacy order item" }, // created before fromCatalog existed
      ],
    };
    mock.method(Order, "find", () => query([order]));
    let productFilter;
    mock.method(Product, "find", (filter) => {
      productFilter = filter;
      return query([{ _id: withFile, printFile: { filename: "x.stl", originalName: "Figurine.stl", size: 1234 } }]);
    });

    const res = await fetch(`${server.url}/api/orders/admin/all`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const [result] = (await res.json()).orders;
    assert.deepEqual(result.items[0].printFile, { originalName: "Figurine.stl", size: 1234 });
    assert.equal(result.items[1].printFile, null);
    assert.deepEqual(result.items[2].printFile, { originalName: "Figurine.stl", size: 1234 });
    assert.deepEqual(productFilter._id.$in, [String(withFile)]);
  });
});
