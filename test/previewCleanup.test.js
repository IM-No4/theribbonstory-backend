import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { mock, query } from "./helpers.js";
import Reference3D from "../src/models/Reference3D.js";
import Order from "../src/models/Order.js";
import { cleanupStalePreviews, PREVIEW_RETENTION_MS } from "../src/services/previewCleanup.js";
import { reference3dDir } from "../src/services/gemini3dAgent.js";

const made = [];
const session = (sessionId, storageKey = sessionId) => {
  const dir = path.join(reference3dDir, storageKey);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "front-1.png"), "x");
  made.push(dir);
  return { _id: new mongoose.Types.ObjectId(), sessionId, storageKey };
};

afterEach(() => {
  mock.restoreAll();
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("Unused 3D preview cleanup", () => {
  it("deletes week-old customer previews that were never ordered and keeps ordered ones", async () => {
    const abandoned = session("ref_old_abandoned");
    const ordered = session("ref_old_ordered");
    let findFilter;
    mock.method(Reference3D, "find", (f) => ((findFilter = f), query([abandoned, ordered])));
    mock.method(Order, "distinct", async () => ["ref_old_ordered"]);
    const removed = [];
    mock.method(Reference3D, "deleteOne", async (f) => removed.push(String(f._id)));
    let markedOrdered;
    mock.method(Reference3D, "updateMany", async (f, u) => (markedOrdered = { f, u }));

    const now = Date.now();
    const result = await cleanupStalePreviews({ now });

    assert.deepEqual(result, { deleted: 1, kept: 1 });
    assert.equal(findFilter.source, "customer", "admin studio sessions are never touched");
    assert.equal(findFilter.createdAt.$lt.getTime(), now - PREVIEW_RETENTION_MS);
    assert.deepEqual(removed, [String(abandoned._id)]);
    assert.ok(!fs.existsSync(path.join(reference3dDir, "ref_old_abandoned")), "files deleted");
    assert.ok(fs.existsSync(path.join(reference3dDir, "ref_old_ordered", "front-1.png")), "ordered design kept");
    assert.deepEqual(markedOrdered.f.sessionId.$in, ["ref_old_ordered"]);
    assert.equal(markedOrdered.u.$set.source, "ordered", "ordered designs leave future scans");
  });

  it("never deletes outside the 3D previews folder", async () => {
    const evil = { _id: new mongoose.Types.ObjectId(), sessionId: "ref_x", storageKey: "../../src" };
    mock.method(Reference3D, "find", () => query([evil]));
    mock.method(Order, "distinct", async () => []);
    mock.method(Reference3D, "deleteOne", async () => {});
    await cleanupStalePreviews();
    assert.ok(fs.existsSync(path.join(reference3dDir, "..", "..", "src", "app.js")));
  });

  it("does nothing when there is nothing old", async () => {
    mock.method(Reference3D, "find", () => query([]));
    const distinct = mock.method(Order, "distinct", async () => []);
    assert.deepEqual(await cleanupStalePreviews(), { deleted: 0, kept: 0 });
    assert.equal(distinct.mock.callCount(), 0);
  });
});
