import mongoose from "mongoose";

const pricingOptionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Small Desk", "Classic Studio", "Grand Collector"
    dimensions: { type: String, required: true, trim: true }, // e.g. '3.5" (9 cm)', '5.5" (14 cm)'
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, default: 0, min: 0 },
    description: { type: String, default: "" }, // e.g. "Desk & compact display"
    isPopular: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const keepsakeCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Single", "Couple", "Family", "Kid", "Pet"
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    tagline: { type: String, default: "" }, // e.g. "Solo portrait or personal character"
    icon: { type: String, default: "User" }, // Icon identifier or emoji
    description: { type: String, default: "" },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    pricingOptions: [pricingOptionSchema],
    engravingSuggestions: [{ type: String, trim: true }],
    image: { type: String, default: "" }, // Category thumbnail URL (e.g. /images/... or /uploads/...)
  },
  { timestamps: true }
);

keepsakeCategorySchema.index({ order: 1, isActive: 1 });

export default mongoose.model("KeepsakeCategory", keepsakeCategorySchema);
