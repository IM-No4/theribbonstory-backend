import express from "express";
import { upload } from "../middleware/upload.js";
import { uploadCustomizationPhoto } from "../controllers/uploadController.js";
import { protect } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Allow single file upload under any common field name ("photo", "image", "file")
router.post(
  "/",
  protect,
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      if (req.files && req.files.length > 0) {
        req.file = req.files[0];
      }
      next();
    });
  },
  asyncHandler(uploadCustomizationPhoto)
);

export default router;
