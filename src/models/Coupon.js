import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: "" },
    discountType: { type: String, enum: ["percentage", "fixed"], default: "fixed" },
    discountAmount: { type: Number, required: true }, // e.g. 100 (for ₹100) or 15 (for 15%)
    minOrderAmount: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 }, // max discount limit for percentage coupons (0 = no limit)
    usageLimit: { type: Number, default: 1000 },
    usedCount: { type: Number, default: 0 },
    validUntil: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.index({ code: 1, isActive: 1 });

export default mongoose.model("Coupon", couponSchema);
