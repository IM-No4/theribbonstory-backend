import express from "express";
import {
  getPublicKeepsakeCategories,
  getAdminKeepsakeCategories,
  createKeepsakeCategory,
  updateKeepsakeCategory,
  deleteKeepsakeCategory,
  resetToDefaults,
} from "../controllers/keepsakeCategoryController.js";
import { protect, admin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Public storefront route: get active keepsake categories & pricing options
router.get("/", asyncHandler(getPublicKeepsakeCategories));

// Admin protected management routes
router.get("/admin", protect, admin, asyncHandler(getAdminKeepsakeCategories));
router.post("/reset-defaults", protect, admin, asyncHandler(resetToDefaults));
router.post("/", protect, admin, asyncHandler(createKeepsakeCategory));
router.put("/:id", protect, admin, asyncHandler(updateKeepsakeCategory));
router.delete("/:id", protect, admin, asyncHandler(deleteKeepsakeCategory));

export default router;
