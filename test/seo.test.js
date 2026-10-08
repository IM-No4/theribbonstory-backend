import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { mock, query, startServer } from "./helpers.js";
import Product from "../src/models/Product.js";
import { absoluteImageUrl } from "../src/routes/seoRoutes.js";

let server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});
afterEach(() => mock.restoreAll());

const product = {
  _id: new mongoose.Types.ObjectId(),
  slug: "couple-figurine",
  name: 'Couple "Forever" Figurine <b>',
  price: 1299,
  tagline: "Hand-painted 3D keepsake of you two",
  images: ["/uploads/abc123.webp"],
  isActive: true,
  updatedAt: new Date("2026-10-01T10:00:00Z"),
};

describe("Sitemap", () => {
  it("lists public pages and live products only", async () => {
    let filter;
    mock.method(Product, "find", (f) => ((filter = f), query([product])));
    const res = await fetch(`${server.url}/sitemap.xml`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /application\/xml/);
    const xml = await res.text();
    assert.match(xml, /<loc>https:\/\/theribbonstory\.com\/<\/loc>/);
    assert.match(xml, /<loc>https:\/\/theribbonstory\.com\/product\/couple-figurine<\/loc><lastmod>2026-10-01T10:00:00.000Z<\/lastmod>/);
    assert.ok(!xml.includes("/admin") && !xml.includes("/checkout") && !xml.includes("/account"));
    assert.deepEqual(filter.isActive, { $ne: false });
  });
});

describe("Product share page", () => {
  it("carries the product's preview tags and redirects visitors to the product", async () => {
    mock.method(Product, "findOne", () => query(product));
    const res = await fetch(`${server.url}/share/product/couple-figurine`, { redirect: "manual" });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<meta property="og:title" content="Couple &quot;Forever&quot; Figurine &lt;b&gt; — ₹1,299 \| The Ribbon Story">/);
    assert.match(html, /<meta property="og:image" content="https:\/\/backend\.theribbonstory\.com\/uploads\/abc123\.webp">/);
    assert.match(html, /<meta property="og:url" content="https:\/\/theribbonstory\.com\/product\/couple-figurine">/);
    assert.match(html, /<meta property="product:price:amount" content="1299">/);
    assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/theribbonstory\.com\/product\/couple-figurine">/);
    assert.ok(!html.includes("<b>"), "product text is escaped");
    assert.match(res.headers.get("content-security-policy"), /script-src 'unsafe-inline'/);
  });

  it("falls back to the shop for unknown products", async () => {
    mock.method(Product, "findOne", () => query(null));
    const html = await (await fetch(`${server.url}/share/product/nope`)).text();
    assert.match(html, /url=https:\/\/theribbonstory\.com\/shop"/);
    assert.match(html, /og:image" content="https:\/\/theribbonstory\.com\/images\/og-default\.jpg"/);
  });

  it("resolves every kind of stored image path to an absolute URL", () => {
    assert.equal(absoluteImageUrl("/uploads/x.webp"), "https://backend.theribbonstory.com/uploads/x.webp");
    assert.equal(absoluteImageUrl("/images/photo-magnet.webp"), "https://theribbonstory.com/images/photo-magnet.webp");
    assert.equal(absoluteImageUrl("/src/assets/images/photo-magnet.jpeg"), "https://theribbonstory.com/images/photo-magnet.webp");
    assert.equal(absoluteImageUrl("https://cdn.example.com/a.jpg"), "https://cdn.example.com/a.jpg");
  });

  it("uses PUBLIC_SITE_URL / PUBLIC_API_URL when set", async () => {
    process.env.PUBLIC_SITE_URL = "https://staging.example.com/";
    process.env.PUBLIC_API_URL = "https://api.staging.example.com";
    try {
      mock.method(Product, "findOne", () => query(product));
      const html = await (await fetch(`${server.url}/share/product/couple-figurine`)).text();
      assert.match(html, /og:url" content="https:\/\/staging\.example\.com\/product\/couple-figurine"/);
      assert.match(html, /og:image" content="https:\/\/api\.staging\.example\.com\/uploads\/abc123\.webp"/);
    } finally {
      delete process.env.PUBLIC_SITE_URL;
      delete process.env.PUBLIC_API_URL;
    }
  });
});
