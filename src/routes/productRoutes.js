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
  uploadProductPrintFile,
  downloadProductPrintFile,
  deleteProductPrintFile,
} from "../controllers/productController.js";
import { uploadPrintFile } from "../middleware/printFileUpload.js";
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

// Admin: private production print files (STL/3MF/OBJ)
router.post("/:id/print-file", protect, admin, uploadPrintFile, asyncHandler(uploadProductPrintFile));
router.get("/:id/print-file", protect, admin, asyncHandler(downloadProductPrintFile));
router.delete("/:id/print-file", protect, admin, asyncHandler(deleteProductPrintFile));

export default router;
