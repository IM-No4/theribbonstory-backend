import express from "express";
import multer from "multer";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import {
  generateChibiFromLocalFile,
  generateChibiFromUrl,
} from "../services/chibiService.js";
import Order from "../models/Order.js";

const router = express.Router();

const upload = multer({
  dest: path.join(os.tmpdir(), "ribbon-chibi-uploads"),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

const customerPhotoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "uploads", "customer_photos");

/**
 * POST /api/chibi/generate
 * Accepts a photo upload via multipart form-data ("photo")
 * OR a JSON payload containing { photoUrl, prompt }
 * Permanently archives the customer's source photo and returns both photoUrl and cuteImageUrl
 */
router.post("/generate", upload.single("photo"), async (req, res) => {
  const engravingText = req.body?.engravingText?.trim();
  const artisanNotes = req.body?.artisanNotes?.trim();
  let customPrompt = req.body?.prompt?.trim() || req.body?.customNotes?.trim() || "";
  let photoUrl = req.body?.photoUrl;

  // Build combined customization instructions if separate fields were provided and not already included
  const extraParts = [];
  if (engravingText && !customPrompt.includes(engravingText)) {
    extraParts.push(`- Engraved Base Text: "${engravingText}" (cleanly sculpt, engrave, or emboss this exact text onto the front surface of the figurine's display base platform)`);
  }
  if (artisanNotes && !customPrompt.includes(artisanNotes)) {
    extraParts.push(`- Studio Artisan Notes: "${artisanNotes}" (incorporate these specific custom details into the figurine sculpt and colors)`);
  }
  if (extraParts.length > 0) {
    customPrompt = customPrompt ? `${customPrompt}\n${extraParts.join("\n")}` : extraParts.join("\n");
  }

  console.log(`\n[API POST /api/chibi/generate] Received generation request:`);
  console.log(`- File:               ${req.file ? `${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)` : "None"}`);
  console.log(`- Photo URL:          ${photoUrl || "None"}`);
  console.log(`- Engraved Base Text: ${engravingText || "None"}`);
  console.log(`- Artisan Notes:      ${artisanNotes || "None"}`);
  console.log(`- Combined Prompt:    ${customPrompt ? `\n${customPrompt}` : "None"}`);

  try {
    let result = null;

    if (req.file) {
      // 1. Ensure permanent customer photo storage
      await fs.mkdir(customerPhotoDir, { recursive: true });
      const ext = path.extname(req.file.originalname) || ".jpg";
      const permanentFilename = `photo-${Date.now()}-${Math.floor(Math.random() * 1e8)}${ext}`;
      const permanentPath = path.join(customerPhotoDir, permanentFilename);

      await fs.copyFile(req.file.path, permanentPath);
      photoUrl = `/uploads/customer_photos/${permanentFilename}`;

      // 2. Generate 3D figurine from the saved file
      try {
        result = await generateChibiFromLocalFile(permanentPath, customPrompt);
      } catch (genError) {
        console.warn("[Chibi Generation Notice] Instant 3D preview deferred:", genError.message || genError);
      }
    } else if (photoUrl) {
      try {
        result = await generateChibiFromUrl(photoUrl, customPrompt);
      } catch (genError) {
        console.warn("[Chibi Generation Notice] Instant 3D preview deferred:", genError.message || genError);
      }
    } else {
      return res.status(400).json({ error: "Please upload a photo to customize your keepsake." });
    }

    // If 3D preview successfully generated
    if (result?.url) {
      return res.json({
        success: true,
        photoUrl,
        imageUrl: result.url,
        cuteImageUrl: result.url,
        filename: result.filename,
        size: result.size,
      });
    }

    // Graceful studio fallback: photo is safely stored; craftsmen model directly from photo
    return res.json({
      success: true,
      photoUrl,
      imageUrl: null,
      cuteImageUrl: null,
      fallbackToPhoto: true,
      message: "Your photo is saved. Our 3D modeling studio will craft your keepsake directly from your photograph.",
    });
  } catch (error) {
    console.error("[Chibi Request Error]:", error);
    return res.json({
      success: true,
      photoUrl: photoUrl || null,
      imageUrl: null,
      cuteImageUrl: null,
      fallbackToPhoto: true,
      message: "Your photo is saved. Our 3D modeling studio will craft your keepsake directly from your photograph.",
    });
  } finally {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
  }
});

/**
 * POST /api/chibi/orders/:orderId/items/:itemIndex/generate
 * Generates the cute 3D chibi figurine for a customer's personalized keepsake order item.
 * Automatically saves the permanent image and updates the order document.
 */
router.post("/orders/:orderId/items/:itemIndex/generate", async (req, res) => {
  const { orderId, itemIndex } = req.params;
  const customPrompt = req.body?.prompt;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const idx = parseInt(itemIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= order.items.length) {
      return res.status(400).json({ error: "Invalid item index" });
    }

    const targetItem = order.items[idx];
    const sourcePhoto =
      targetItem.customization?.photoUrl ||
      targetItem.customization?.photo ||
      targetItem.customization?.sourcePhotoUrl;

    if (!sourcePhoto) {
      return res.status(400).json({
        error: "This order item does not have a customer photo attached.",
      });
    }

    // Generate Chibi 3D Figurine
    const result = await generateChibiFromUrl(sourcePhoto, customPrompt);

    if (!targetItem.customization) {
      targetItem.customization = {};
    }

    targetItem.customization.cuteImageUrl = result.url;
    targetItem.customization.cuteImageUploadedAt = new Date();
    targetItem.customization.productionStatus = "cute_ready";

    if (!targetItem.customization.reference3D) {
      targetItem.customization.reference3D = {};
    }
    targetItem.customization.reference3D.approvedPreview = result.url;
    targetItem.customization.reference3D.approvedAt = new Date();

    await order.save();

    return res.json({
      success: true,
      message: "Cute 3D Chibi generated and saved successfully!",
      imageUrl: result.url,
      filename: result.filename,
      order,
    });
  } catch (error) {
    console.error("[Order Chibi Generation Error]:", error);
    return res.status(502).json({
      error: error.message || "Failed to generate Chibi image for this order.",
    });
  }
});

export default router;
