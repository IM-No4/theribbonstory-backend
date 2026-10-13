import express from "express";
import { getPublicConfig } from "../controllers/configController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Public configuration bootstrap endpoint
router.get("/", asyncHandler(getPublicConfig));

export default router;
