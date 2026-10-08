import fs from "fs";
import path from "path";
import Reference3D from "../models/Reference3D.js";
import Order from "../models/Order.js";
import { reference3dDir } from "./gemini3dAgent.js";

/** Customer previews not used in any order are deleted after this long */
export const PREVIEW_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;
const BATCH = 200;

/**
 * Delete customer 3D previews (photo + design attempts) that are older than
 * the retention period and not referenced by any order. Ordered designs and
 * admin studio sessions are always kept.
 */
export const cleanupStalePreviews = async ({ now = Date.now(), retentionMs = PREVIEW_RETENTION_MS } = {}) => {
  const stale = await Reference3D.find({ source: "customer", createdAt: { $lt: new Date(now - retentionMs) } })
    .select("sessionId storageKey")
    .limit(BATCH);
  if (stale.length === 0) return { deleted: 0, kept: 0 };

  const ordered = new Set(
    (await Order.distinct("items.customization.reference3D.sessionId", {
      "items.customization.reference3D.sessionId": { $in: stale.map((s) => s.sessionId) },
    })).map(String)
  );

  // Ordered designs are kept for good: take them out of future scans
  if (ordered.size > 0) await Reference3D.updateMany({ sessionId: { $in: [...ordered] } }, { $set: { source: "ordered" } });

  let deleted = 0;
  for (const session of stale) {
    if (ordered.has(session.sessionId)) continue;
    const dir = path.resolve(reference3dDir, path.basename(String(session.storageKey || "")));
    if (session.storageKey && dir.startsWith(reference3dDir + path.sep)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    await Reference3D.deleteOne({ _id: session._id });
    deleted += 1;
  }
  return { deleted, kept: stale.length - deleted };
};

/** Run the cleanup shortly after start-up and then every few hours */
export const scheduleCleanup = () => {
  const run = () =>
    cleanupStalePreviews()
      .then(({ deleted }) => deleted && console.log(`[PreviewCleanup] Deleted ${deleted} unused 3D preview(s)`))
      .catch((err) => console.error("[PreviewCleanup] Failed:", err.message));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, SWEEP_EVERY_MS).unref();
};
