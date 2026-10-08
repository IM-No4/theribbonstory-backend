import express from "express";
import Product from "../models/Product.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { escapeHtml as esc } from "../utils/security.js";

/**
 * SEO endpoints served by the API host:
 * - /sitemap.xml lists the storefront's public pages and every live product
 *   (declared in the storefront's robots.txt)
 * - /share/product/:slug is the link used by the storefront's Share button.
 *   WhatsApp, Instagram and Facebook don't run JavaScript, so this page
 *   carries the product's preview tags (title, price, photo) and sends real
 *   visitors straight on to the product page.
 */
const router = express.Router();

export const siteUrl = () => (process.env.PUBLIC_SITE_URL || "https://theribbonstory.com").replace(/\/$/, "");
export const apiPublicUrl = () => (process.env.PUBLIC_API_URL || "https://backend.theribbonstory.com").replace(/\/$/, "");

const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/shop", priority: "0.9", changefreq: "daily" },
  { path: "/3d-keepsakes", priority: "0.9", changefreq: "weekly" },
  { path: "/personalized", priority: "0.8", changefreq: "weekly" },
  { path: "/build-a-box", priority: "0.8", changefreq: "weekly" },
  { path: "/how-it-works", priority: "0.5", changefreq: "monthly" },
  { path: "/about", priority: "0.5", changefreq: "monthly" },
  { path: "/contact", priority: "0.4", changefreq: "monthly" },
  { path: "/track-order", priority: "0.3", changefreq: "monthly" },
];

/** Absolute URL for a stored image path, matching the storefront's assetUrl() */
export const absoluteImageUrl = (image) => {
  if (!image) return `${siteUrl()}/images/og-default.jpg`;
  if (/^https?:\/\//.test(image)) return image;
  const legacy = /^\/src\/assets\/images\/([\w-]+)\.(?:jpe?g|png)$/.exec(image);
  if (legacy) return `${siteUrl()}/images/${legacy[1]}.webp`;
  if (image.startsWith("/uploads/")) return `${apiPublicUrl()}${image}`;
  return `${siteUrl()}${image.startsWith("/") ? "" : "/"}${image}`;
};

const xmlEscape = (s) => esc(s).replace(/&#39;/g, "&apos;");

router.get(
  "/sitemap.xml",
  asyncHandler(async (req, res) => {
    const products = await Product.find({ isActive: { $ne: false } }).select("slug updatedAt");
    const urls = [
      ...STATIC_PAGES.map(
        (p) => `<url><loc>${xmlEscape(siteUrl() + p.path)}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`
      ),
      ...products.map(
        (p) =>
          `<url><loc>${xmlEscape(`${siteUrl()}/product/${encodeURIComponent(p.slug)}`)}</loc>${
            p.updatedAt ? `<lastmod>${new Date(p.updatedAt).toISOString()}</lastmod>` : ""
          }<changefreq>weekly</changefreq><priority>0.8</priority></url>`
      ),
    ];
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
  })
);

router.get(
  "/share/product/:slug",
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug).slice(0, 200);
    const product = await Product.findOne({ slug, isActive: { $ne: false } });
    const target = product ? `${siteUrl()}/product/${encodeURIComponent(product.slug)}` : `${siteUrl()}/shop`;

    const title = product ? `${product.name} — ₹${Number(product.price).toLocaleString("en-IN")} | The Ribbon Story` : "The Ribbon Story";
    const description = String(
      product?.tagline || product?.description || "Handcrafted personalised keepsakes, 3D figurines and gift hampers."
    )
      .replace(/\s+/g, " ")
      .slice(0, 200);
    const image = absoluteImageUrl(product?.images?.[0]);

    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "public, max-age=600");
    // The redirect script is inline; allow it on this page only
    res.set("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; img-src *; style-src 'unsafe-inline'");
    res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(target)}">
<meta name="robots" content="noindex, follow">
<meta property="og:type" content="product">
<meta property="og:site_name" content="The Ribbon Story">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(target)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(product?.name || "The Ribbon Story")}">
${product ? `<meta property="product:price:amount" content="${esc(product.price)}">\n<meta property="product:price:currency" content="INR">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
</head>
<body style="font-family:sans-serif;text-align:center;padding:40px">
<p>Opening <a href="${esc(target)}">${esc(product?.name || "The Ribbon Story")}</a>…</p>
<script>location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")});</script>
</body>
</html>`);
  })
);

export default router;
