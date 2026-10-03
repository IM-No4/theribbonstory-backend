import path from "path";
import fs from "fs";
import Reference3D from "../models/Reference3D.js";
import Order from "../models/Order.js";
import { runReferenceGenerationPipeline } from "../services/gemini3dAgent.js";

/**
 * @desc Generate 4-view 3D reference set for an uploaded photo or URL
 * @route POST /api/3d-agent/generate
 * @access Public / Protected
 */
export const generateReferenceViews = async (req, res) => {
  const { photoUrl, customNotes, orderId } = req.body;
  const uploadedFile = req.file;

  if (!uploadedFile && !photoUrl) {
    return res.status(400).json({ message: "Please provide an uploaded photo or existing image URL" });
  }

  const session = await runReferenceGenerationPipeline({
    uploadedFile,
    existingPhotoUrl: photoUrl,
    orderId: orderId || null,
    userId: req.user?._id || null,
    customNotes: customNotes || "",
  });

  return res.status(201).json({
    success: true,
    message: "4-View 3D references generated successfully for Meshy / Tripo",
    session,
  });
};

/**
 * @desc Generate 4-view 3D references specifically for a customer order
 * @route POST /api/3d-agent/order/:orderId/generate
 * @access Admin
 */
export const generateForOrder = async (req, res) => {
  const { orderId } = req.params;
  const { customNotes } = req.body;

  const order = await Order.findById(orderId).populate("user", "name email");
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  // Find customization photo in order items
  let photoUrl = null;
  let orderNotes = customNotes || "";

  for (const item of order.items) {
    if (item.customization?.photoUrl) {
      photoUrl = item.customization.photoUrl;
      if (item.customization.note) {
        orderNotes += (orderNotes ? " | " : "") + item.customization.note;
      }
      break;
    }
  }

  if (!photoUrl) {
    return res.status(400).json({
      message: "This order does not contain an uploaded customization photo to generate 3D references from.",
    });
  }

  const session = await runReferenceGenerationPipeline({
    existingPhotoUrl: photoUrl,
    orderId: order._id,
    userId: order.user?._id || null,
    customNotes: orderNotes,
  });

  return res.status(200).json({
    success: true,
    message: `3D Reference images generated for Order #${order._id.toString().slice(-6).toUpperCase()}`,
    session,
  });
};

/**
 * @desc Get status and views of a specific 3D reference generation session
 * @route GET /api/3d-agent/session/:sessionId
 * @access Public / Protected
 */
export const getSessionDetails = async (req, res) => {
  const { sessionId } = req.params;
  const session = await Reference3D.findOne({ sessionId });

  if (!session) {
    return res.status(404).json({ message: "Reference 3D session not found" });
  }

  return res.json({ success: true, session });
};

/**
 * @desc List all generated 3D reference packages
 * @route GET /api/3d-agent/all
 * @access Admin
 */
export const listAllSessions = async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const query = {};
  if (status && status !== "all") query.status = status;

  const total = await Reference3D.countDocuments(query);
  const sessions = await Reference3D.find(query)
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate("orderId", "_id status totalPrice createdAt")
    .populate("userId", "name email");

  return res.json({
    success: true,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    sessions,
  });
};

/**
 * @desc Download zip package of all 4 views + original image
 * @route GET /api/3d-agent/session/:sessionId/download
 * @access Public / Protected
 */
export const downloadZipPackage = async (req, res) => {
  const { sessionId } = req.params;
  const session = await Reference3D.findOne({ sessionId });

  if (!session || !session.zipPackagePath || !fs.existsSync(session.zipPackagePath)) {
    return res.status(404).json({ message: "ZIP reference package file not found" });
  }

  const filename = `${session.storageKey}_3d_references.zip`;
  return res.download(session.zipPackagePath, filename);
};
