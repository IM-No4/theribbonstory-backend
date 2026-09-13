import mongoose from "mongoose";

const optionValueSchema = new mongoose.Schema(
  {
    label: String,
    priceDelta: { type: Number, default: 0 },
  },
  { _id: false }
);

const optionGroupSchema = new mongoose.Schema(
  {
    name: String, // e.g. "Shape", "Size", "Hamper Size"
    values: [optionValueSchema],
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    category: {
      type: String,
      required: true,
      index: true,
    },
    tagline: String,
    description: String,
    price: { type: Number, required: true },
    compareAtPrice: Number,
    images: [{ type: String }],
    accentColor: { type: String, default: "#a83f52" },
    isCustomizable: { type: Boolean, default: false },
    customizationPrompt: { type: String, default: "Upload your favourite photo" },
    optionGroups: [optionGroupSchema],
    occasions: { type: [String], index: true },
    tags: [String],
    rating: { type: Number, default: 4.8 },
    reviewCount: { type: Number, default: 0 },
    stock: { type: Number, default: 100 },
    isFeatured: { type: Boolean, default: false },
    isBestseller: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ name: "text", description: "text", tags: "text" });
productSchema.index({ category: 1, isActive: 1, price: 1 });
productSchema.index({ isFeatured: 1, isBestseller: 1 });

export default mongoose.model("Product", productSchema);
