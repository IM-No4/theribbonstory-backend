import express from "express";
import rateLimit from "express-rate-limit";
import { upload, verifyUploadedImages, optimizeUploadedImages } from "../middleware/upload.js";
import { protect, admin, optionalUser } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  generateReferenceViews,
  generateForOrder,
  createPreview,
  regenerateCustomerPreview,
  getSessionDetails,
  listAllSessions,
  downloadZipPackage,
} from "../controllers/reference3dController.js";

const router = express.Router();

// Previews call the paid Gemini image API: limit per IP (uploads + retries)
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many 3D preview requests. Please try again in an hour." },
});

const photoUpload = (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

// Customer: photo -> cute 3D front-view preview (one image generation)
router.post(
  "/preview",
  generateLimiter,
  optionalUser,
  photoUpload,
  verifyUploadedImages,
  optimizeUploadedImages,
  asyncHandler(createPreview)
);

// Customer: another design attempt from the same photo (limited per photo)
router.post("/preview/:sessionId/regenerate", generateLimiter, asyncHandler(regenerateCustomerPreview));

// Admin: full 4-view reference set for an uploaded photo or existing image URL
router.post(
  "/generate",
  protect,
  admin,
  photoUpload,
  verifyUploadedImages,
  asyncHandler(generateReferenceViews)
);

// Admin: Trigger 4-view generation for a specific customer order
router.post("/order/:orderId/generate", protect, admin, asyncHandler(generateForOrder));

// Get session details & views
router.get("/session/:sessionId", asyncHandler(getSessionDetails));

// Download zip package
router.get("/session/:sessionId/download", asyncHandler(downloadZipPackage));

// Admin: List all sessions
router.get("/all", protect, admin, asyncHandler(listAllSessions));

export default router;
