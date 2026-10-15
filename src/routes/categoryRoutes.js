import express from "express";
import {
  getCategories,
  getCategoryBySlug,
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryProducts,
  assignProductsToCategory,
  removeProductsFromCategory,
} from "../controllers/categoryController.js";
import { protect, admin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Public routes
router.get("/", asyncHandler(getCategories));
router.get("/slug/:slug", asyncHandler(getCategoryBySlug));

// Admin routes
router.get("/admin/all", protect, admin, asyncHandler(getAdminCategories));
router.get("/:id/products", protect, admin, asyncHandler(getCategoryProducts));
router.post("/:id/products/assign", protect, admin, asyncHandler(assignProductsToCategory));
router.post("/:id/products/remove", protect, admin, asyncHandler(removeProductsFromCategory));
router.post("/", protect, admin, asyncHandler(createCategory));
router.put("/:id", protect, admin, asyncHandler(updateCategory));
router.delete("/:id", protect, admin, asyncHandler(deleteCategory));

export default router;
