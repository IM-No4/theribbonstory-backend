import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { mock, startServer, fakeUser, authAs } from "./helpers.js";
import User from "../src/models/User.js";

const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads");

let server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});
afterEach(() => mock.restoreAll());

const upload = async (buffer, name, type) => {
  const token = authAs(User, fakeUser({ role: "admin" }));
  const form = new FormData();
  form.append("photo", new Blob([buffer], { type }), name);
  return fetch(`${server.url}/api/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
};
const storedFile = (url) => path.join(uploadsDir, path.basename(url));

describe("Uploaded images are optimised", () => {
  it("phone photo: resized to 2000px, rotated upright, WebP, location data removed", async () => {
    // 4000x3000 landscape pixels that the camera tagged as "rotate 90°" (portrait),
    // with GPS coordinates in the EXIF
    const photo = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 180, g: 60, b: 90 } } })
      .jpeg({ quality: 95 })
      .withMetadata({ orientation: 6 })
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "12/1 58/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "77/1 35/1 0/1" } })
      .toBuffer();
    const before = await sharp(photo).metadata();
    assert.equal(before.orientation, 6);
    assert.ok(before.exif, "test photo has EXIF");

    const res = await upload(photo, "IMG_2041.JPG", "image/jpeg");
    assert.equal(res.status, 201);
    const { url } = await res.json();
    assert.match(url, /^\/uploads\/[\w-]+\.webp$/);

    const file = storedFile(url);
    const meta = await sharp(file).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 1500, "rotated upright: portrait");
    assert.equal(meta.height, 2000, "long side capped at 2000px");
    assert.equal(meta.exif, undefined, "EXIF (incl. GPS) removed");
    assert.equal(meta.orientation, undefined);
    assert.ok(fs.statSync(file).size < photo.length / 3, "much smaller than the original");
    assert.equal(fs.existsSync(file.replace(/\.webp$/, ".jpg")), false, "original deleted");
    fs.unlinkSync(file);
  });

  it("small transparent PNG: keeps transparency and is not enlarged", async () => {
    const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const res = await upload(png, "logo.png", "image/png");
    assert.equal(res.status, 201);
    const file = storedFile((await res.json()).url);
    const meta = await sharp(file).metadata();
    assert.equal(meta.width, 300);
    assert.equal(meta.height, 200);
    assert.equal(meta.hasAlpha, true);
    fs.unlinkSync(file);
  });

  it("an image that is already WebP is processed too", async () => {
    const webp = await sharp({ create: { width: 2600, height: 1000, channels: 3, background: "#ccc" } }).webp().toBuffer();
    const res = await upload(webp, "banner.webp", "image/webp");
    assert.equal(res.status, 201);
    const file = storedFile((await res.json()).url);
    const meta = await sharp(file).metadata();
    assert.equal(meta.width, 2000);
    assert.equal(fs.readdirSync(uploadsDir).some((f) => f.endsWith(".tmp")), false, "no temp files left");
    fs.unlinkSync(file);
  });

  it("a corrupt image with a valid header is rejected and removed", async () => {
    const before = new Set(fs.readdirSync(uploadsDir));
    const corrupt = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
    const res = await upload(corrupt, "broken.png", "image/png");
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /could not be processed/);
    await new Promise((r) => setTimeout(r, 50));
    const leftovers = fs.readdirSync(uploadsDir).filter((f) => !before.has(f));
    assert.deepEqual(leftovers, []);
  });
});
