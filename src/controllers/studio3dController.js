import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Order from "../models/Order.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");

/**
 * GET /api/3d-studio/orders
 * List all incoming orders with custom keepsake photos intact.
 */
export const getKeepsakeOrders = async (req, res) => {
  const { status, search } = req.query;

  // Find all orders that have at least one keepsake item with a customer photo
  const query = {
    $or: [
      { "items.customization.photoUrl": { $exists: true, $ne: "" } },
      { "items.customization.reference3D.approvedPreview": { $exists: true, $ne: "" } },
      { "items.customization.cuteImageUrl": { $exists: true, $ne: "" } },
    ],
  };

  const orders = await Order.find(query)
    .populate("user", "name email phone")
    .sort({ createdAt: -1 })
    .lean();

  // Aggregate dashboard metrics
  let totalKeepsakeItems = 0;
  let pendingDesignCount = 0;
  let cuteReadyCount = 0;
  let modelReadyCount = 0;
  let queuedPrintCount = 0;
  let printedCount = 0;

  // Filter & augment items
  const processedOrders = orders.map((order) => {
    const keepsakeItems = (order.items || [])
      .map((item, index) => {
        const hasKeepsake =
          Boolean(item.customization?.photoUrl) ||
          Boolean(item.customization?.reference3D?.approvedPreview) ||
          Boolean(item.customization?.cuteImageUrl);

        if (!hasKeepsake) return null;

        totalKeepsakeItems += 1;
        const prodStatus = item.customization?.productionStatus || "pending_design";
        if (prodStatus === "pending_design") pendingDesignCount += 1;
        else if (prodStatus === "cute_ready") cuteReadyCount += 1;
        else if (prodStatus === "model_ready") modelReadyCount += 1;
        else if (prodStatus === "queued_for_print") queuedPrintCount += 1;
        else if (prodStatus === "printed") printedCount += 1;

        return {
          ...item,
          itemIndex: index,
        };
      })
      .filter(Boolean);

    return {
      ...order,
      keepsakeItems,
    };
  }).filter((o) => o.keepsakeItems.length > 0);

  // Apply search filtering in-memory if requested
  let filtered = processedOrders;
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter((o) => {
      const orderIdStr = String(o._id).toLowerCase();
      const customerName = (o.shippingAddress?.name || o.user?.name || "").toLowerCase();
      const email = (o.user?.email || "").toLowerCase();
      const hasProduct = o.keepsakeItems.some((i) => i.name?.toLowerCase().includes(q));
      return orderIdStr.includes(q) || customerName.includes(q) || email.includes(q) || hasProduct;
    });
  }

  // Apply status filter
  if (status && status !== "all") {
    filtered = filtered.filter((o) =>
      o.keepsakeItems.some((i) => (i.customization?.productionStatus || "pending_design") === status)
    );
  }

  res.json({
    success: true,
    orders: filtered,
    stats: {
      totalOrders: processedOrders.length,
      totalKeepsakeItems,
      pendingDesignCount,
      cuteReadyCount,
      modelReadyCount,
      queuedPrintCount,
      printedCount,
    },
  });
};

/**
 * POST /api/3d-studio/orders/:orderId/items/:itemIndex/upload-cute
 * Upload stylized cute 3D keepsake image (generated via ChatGPT / Midjourney).
 */
export const uploadCuteKeepsakeImage = async (req, res) => {
  const { orderId, itemIndex } = req.params;

  if (!req.file) {
    return res.status(400).json({ message: "No image file provided" });
  }

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  const idx = parseInt(itemIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= order.items.length) {
    return res.status(400).json({ message: "Invalid item index" });
  }

  const cuteUrl = `/uploads/${req.file.filename}`;
  const targetItem = order.items[idx];

  if (!targetItem.customization) {
    targetItem.customization = {};
  }

  targetItem.customization.cuteImageUrl = cuteUrl;
  targetItem.customization.cuteImageUploadedAt = new Date();

  // Also sync with reference3D.approvedPreview so existing store/cart preview displays it
  if (!targetItem.customization.reference3D) {
    targetItem.customization.reference3D = {};
  }
  targetItem.customization.reference3D.approvedPreview = cuteUrl;
  targetItem.customization.reference3D.approvedAt = new Date();

  // Advance production status if currently pending
  if (!targetItem.customization.productionStatus || targetItem.customization.productionStatus === "pending_design") {
    targetItem.customization.productionStatus = "cute_ready";
  }

  await order.save();

  res.json({
    success: true,
    message: "Cute 3D keepsake image uploaded successfully!",
    cuteImageUrl: cuteUrl,
    order,
  });
};

/**
 * POST /api/3d-studio/orders/:orderId/items/:itemIndex/upload-model
 * Upload 3D model file (.3mf, .obj, .stl, .glb, .zip) generated via Tripo.
 */
export const upload3DModelFile = async (req, res) => {
  const { orderId, itemIndex } = req.params;

  if (!req.file) {
    return res.status(400).json({ message: "No 3D model file provided" });
  }

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  const idx = parseInt(itemIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= order.items.length) {
    return res.status(400).json({ message: "Invalid item index" });
  }

  const modelUrl = `/uploads/models/${req.file.filename}`;
  const targetItem = order.items[idx];

  if (!targetItem.customization) {
    targetItem.customization = {};
  }

  targetItem.customization.model3dUrl = modelUrl;
  targetItem.customization.model3dFilename = req.file.originalname;
  targetItem.customization.model3dSize = req.file.size;
  targetItem.customization.model3dUploadedAt = new Date();

  // Advance production status
  if (["pending_design", "cute_ready"].includes(targetItem.customization.productionStatus)) {
    targetItem.customization.productionStatus = "model_ready";
  }

  await order.save();

  res.json({
    success: true,
    message: "3D model file (.3mf / .obj) attached successfully!",
    model3dUrl: modelUrl,
    model3dFilename: req.file.originalname,
    order,
  });
};

/**
 * PATCH /api/3d-studio/orders/:orderId/items/:itemIndex/status
 * Update production status and workshop slicing notes.
 */
export const updateKeepsakeProductionStatus = async (req, res) => {
  const { orderId, itemIndex } = req.params;
  const { productionStatus, productionNotes } = req.body;

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  const idx = parseInt(itemIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= order.items.length) {
    return res.status(400).json({ message: "Invalid item index" });
  }

  const targetItem = order.items[idx];
  if (!targetItem.customization) {
    targetItem.customization = {};
  }

  if (productionStatus) {
    targetItem.customization.productionStatus = productionStatus;
  }
  if (typeof productionNotes === "string") {
    targetItem.customization.productionNotes = productionNotes;
  }

  await order.save();

  res.json({
    success: true,
    message: "Workshop status updated",
    order,
  });
};

/**
 * GET /api/3d-studio/download
 * Force-download an asset (customer photo or 3D model) with a clean descriptive filename.
 */
export const downloadAsset = async (req, res) => {
  const { fileUrl, downloadName } = req.query;
  if (!fileUrl) return res.status(400).json({ message: "fileUrl query parameter required" });

  // Sanitize path to prevent directory traversal
  let cleanRel = String(fileUrl).replace(/^[\\/]+/, "");
  if (cleanRel.startsWith("uploads/")) {
    cleanRel = cleanRel.replace(/^uploads[\\/]/, "");
  }

  const filePath = path.resolve(uploadsDir, cleanRel);

  // Security check: must reside inside uploadsDir
  if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  const filename = downloadName ? path.basename(downloadName) : path.basename(filePath);
  res.download(filePath, filename);
};
