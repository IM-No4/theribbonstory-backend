import mongoose from "mongoose";

export const DEFAULT_PRINT_COLORS = [
  { name: "White", hex: "#FFFFFF", isActive: true },
  { name: "Black", hex: "#111111", isActive: true },
  { name: "Beige / Skin", hex: "#F5D0B0", isActive: true },
  { name: "Red", hex: "#E53E3E", isActive: true },
  { name: "Blue", hex: "#3182CE", isActive: true },
  { name: "Yellow", hex: "#D69E2E", isActive: true },
  { name: "Green", hex: "#38A169", isActive: true },
  { name: "Brown", hex: "#7B341E", isActive: true },
  { name: "Grey", hex: "#718096", isActive: true },
  { name: "Pink", hex: "#ED64A6", isActive: true },
  { name: "Orange", hex: "#DD6B20", isActive: true },
];

const studioSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    availableColors: [
      {
        name: { type: String, required: true },
        hex: { type: String, default: "#000000" },
        isActive: { type: Boolean, default: true },
      },
    ],
    maxColorsPerModel: { type: Number, default: 4 },
    customKeepsakesEnabled: { type: Boolean, default: true },
    // Seasonal home page hero (e.g. Christmas); when disabled the standard hero is shown
    heroTheme: {
      enabled: { type: Boolean, default: false },
      preset: { type: String, default: "custom" },
      badge: { type: String, default: "" },
      headline: { type: String, default: "" },
      highlight: { type: String, default: "" },
      subtext: { type: String, default: "" },
      overlayText: { type: String, default: "" },
      ctaText: { type: String, default: "" },
      ctaLink: { type: String, default: "/shop" },
      bannerText: { type: String, default: "" },
      images: [{ type: String }],
      mobileImages: [{ type: String }],
      pageBackground: { type: String, default: "" },
    },
    heroThemeDrafts: { type: mongoose.Schema.Types.Mixed, default: {} },
    orderNotificationEmails: [{ type: String, trim: true, lowercase: true }],
  },
  { timestamps: true }
);

export default mongoose.model("StudioSettings", studioSettingsSchema);
