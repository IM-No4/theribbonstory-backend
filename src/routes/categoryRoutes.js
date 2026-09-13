import express from "express";
import {
  getCategories,
  getCategoryBySlug,
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/categoryController.js";
import { protect, admin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Public routes
router.get("/", asyncHandler(getCategories));
router.get("/slug/:slug", asyncHandler(getCategoryBySlug));

// Admin routes
router.get("/admin/all", protect, admin, asyncHandler(getAdminCategories));
router.post("/", protect, admin, asyncHandler(createCategory));
router.put("/:id", protect, admin, asyncHandler(updateCategory));
router.delete("/:id", protect, admin, asyncHandler(deleteCategory));

export default router;
