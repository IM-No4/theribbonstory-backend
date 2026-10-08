import express from "express";
import rateLimit from "express-rate-limit";
import { upload, verifyUploadedImages } from "../middleware/upload.js";
import { protect, admin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  generateReferenceViews,
  generateForOrder,
  getSessionDetails,
  listAllSessions,
  downloadZipPackage,
} from "../controllers/reference3dController.js";

const router = express.Router();

// Public generation calls the paid Gemini API — keep it tightly limited per IP
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many 3D preview requests. Please try again in an hour." },
});

// Generate 4-view 3D references for uploaded image file or URL
router.post(
  "/generate",
  generateLimiter,
  (req, res, next) => {
    upload.single("photo")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  },
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
