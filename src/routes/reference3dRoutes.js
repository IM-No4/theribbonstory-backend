import express from "express";
import { upload } from "../middleware/upload.js";
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

// Generate 4-view 3D references for uploaded image file or URL
router.post(
  "/generate",
  (req, res, next) => {
    upload.single("photo")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  },
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
