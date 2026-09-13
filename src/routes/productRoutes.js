import express from "express";
import {
  getProducts,
  getProductBySlug,
  getCategories,
  getOccasions,
  getAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";
import { protect, admin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Public routes
router.get("/", asyncHandler(getProducts));
router.get("/categories", asyncHandler(getCategories));
router.get("/occasions", asyncHandler(getOccasions));
router.get("/:slug", asyncHandler(getProductBySlug));

// Admin routes
router.get("/admin/all", protect, admin, asyncHandler(getAdminProducts));
router.post("/", protect, admin, asyncHandler(createProduct));
router.put("/:id", protect, admin, asyncHandler(updateProduct));
router.delete("/:id", protect, admin, asyncHandler(deleteProduct));

export default router;
