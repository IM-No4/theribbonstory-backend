import express from "express";
import { protect, admin } from "../middleware/auth.js";
import { upload, verifyUploadedImages, optimizeUploadedImages } from "../middleware/upload.js";
import { modelUpload } from "../middleware/modelUpload.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getKeepsakeOrders,
  uploadCuteKeepsakeImage,
  upload3DModelFile,
  updateKeepsakeProductionStatus,
  downloadAsset,
  getPrintColors,
  updatePrintColors,
} from "../controllers/studio3dController.js";

const router = express.Router();

// Helper for image upload
const singleImage = (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

// Helper for 3D model upload (.3mf, .obj, .stl, .glb, .zip)
const singleModel = (req, res, next) => {
  modelUpload.single("model")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

// All routes require admin credentials
router.use(protect, admin);

// Get all custom keepsake orders
router.get("/orders", asyncHandler(getKeepsakeOrders));

// Upload cute 3D design image against an order item
router.post(
  "/orders/:orderId/items/:itemIndex/upload-cute",
  singleImage,
  verifyUploadedImages,
  optimizeUploadedImages,
  asyncHandler(uploadCuteKeepsakeImage)
);

// Upload 3D model file (.3mf, .obj, .stl, etc.) against an order item
router.post(
  "/orders/:orderId/items/:itemIndex/upload-model",
  singleModel,
  asyncHandler(upload3DModelFile)
);

// Update item production status and workshop slicing notes
router.patch(
  "/orders/:orderId/items/:itemIndex/status",
  asyncHandler(updateKeepsakeProductionStatus)
);

// Color Palette Management for 3D Printing
router.get("/colors", asyncHandler(getPrintColors));
router.put("/colors", asyncHandler(updatePrintColors));

// Force-download asset with descriptive name
router.get("/download", asyncHandler(downloadAsset));

export default router;
