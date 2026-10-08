import mongoose from "mongoose";

const viewSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    localPath: { type: String, default: "" },
    filename: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "generating", "completed", "failed"],
      default: "pending",
    },
    cameraAngle: { type: String, required: true },
    promptUsed: { type: String, default: "" },
    generatedAt: { type: Date },
    fileSize: { type: Number, default: 0 },
  },
  { _id: false }
);

const reference3DSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    
    originalImage: {
      url: { type: String, required: true },
      localPath: { type: String, required: true },
      filename: { type: String, required: true },
      mimetype: { type: String, default: "image/jpeg" },
      size: { type: Number, default: 0 },
    },

    folderPath: { type: String, required: true },
    storageKey: { type: String, required: true }, // e.g. "ref_order_123" or "ref_session_abc"

    views: {
      front: {
        type: viewSchema,
        default: () => ({ cameraAngle: "Front (0° Master Design View)" }),
      },
      left: {
        type: viewSchema,
        default: () => ({ cameraAngle: "Left Three-Quarter (+45°)" }),
      },
      right: {
        type: viewSchema,
        default: () => ({ cameraAngle: "Right Three-Quarter (-45°)" }),
      },
      back: {
        type: viewSchema,
        default: () => ({ cameraAngle: "Rear / Back (180°)" }),
      },
    },

    status: {
      type: String,
      enum: ["queued", "processing_front", "preview_ready", "processing_multiview", "completed", "failed"],
      default: "queued",
      index: true,
    },

    // Customer preview flow: each attempt writes front-<n>.png so an image a
    // customer approved for an order is never overwritten by a later attempt
    previewAttempts: { type: Number, default: 0 },
    // false when Gemini was unavailable and only a placeholder could be drawn;
    // placeholders are never offered to customers as their design
    previewIsReal: { type: Boolean, default: false },
    customNotes: { type: String, default: "" },
    // "customer" previews that never make it into an order are deleted after
    // a week (see services/previewCleanup.js); admin studio sessions are kept
    source: { type: String, enum: ["customer", "ordered", "admin"], default: "admin" },

    readinessScore: {
      overall: { type: Number, default: 95 },
      silhouetteClarity: { type: Number, default: 98 },
      fdmPrintability: { type: Number, default: 94 },
      crossViewConsistency: { type: Number, default: 96 },
      neutralLighting: { type: Number, default: 95 },
      targetPrinter: { type: String, default: "Bambu Lab A1 / A1 Combo (0.4mm nozzle)" },
      reconstructionEngine: { type: String, default: "Meshy / Tripo Image-to-3D Ready" },
    },

    analysisSummary: {
      detectedSubjects: [String],
      meaningfulObjects: [String],
      removedClutter: [String],
      primaryColors: [String],
      sculptStyle: { type: String, default: "Ribbon Story Premium Stylized Figurine" },
    },

    generationLogs: [
      {
        step: { type: String, required: true },
        message: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    zipPackageUrl: { type: String, default: "" },
    zipPackagePath: { type: String, default: "" },
    errorMessage: { type: String, default: "" },
  },
  { timestamps: true }
);

reference3DSchema.index({ createdAt: -1 });
reference3DSchema.index({ source: 1, createdAt: 1 });

export default mongoose.model("Reference3D", reference3DSchema);
