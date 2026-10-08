import express from "express";
import {
  register,
  login,
  googleAuth,
  getMe,
  logout,
  addAddress,
  deleteAddress,
  updateProfile,
  forgotPassword,
  resetPassword,
  requestSetPassword,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

router.post("/register", asyncHandler(register));
router.post("/login", asyncHandler(login));
router.post("/google", asyncHandler(googleAuth));
router.post("/forgot-password", asyncHandler(forgotPassword));
router.post("/reset-password/:token", asyncHandler(resetPassword));
router.post("/set-password", asyncHandler(requestSetPassword));
router.post("/logout", asyncHandler(logout));

router.get("/me", protect, asyncHandler(getMe));
router.put("/profile", protect, asyncHandler(updateProfile));
router.post("/address", protect, asyncHandler(addAddress));
router.delete("/address/:addressId", protect, asyncHandler(deleteAddress));

export default router;
