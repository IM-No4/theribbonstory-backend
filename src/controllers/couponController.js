import Coupon from "../models/Coupon.js";

export const applyCoupon = async (req, res) => {
  const { code, subtotal } = req.body;
  if (!code) return res.status(400).json({ message: "Coupon code is required" });

  const cleanCode = code.trim().toUpperCase();
  const coupon = await Coupon.findOne({ code: cleanCode, isActive: true });

  if (!coupon) {
    return res.status(404).json({ message: `Coupon "${cleanCode}" is invalid or expired` });
  }

  if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
    return res.status(400).json({ message: `Coupon "${cleanCode}" has expired` });
  }

  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    return res.status(400).json({ message: `Coupon "${cleanCode}" usage limit reached` });
  }

  const orderAmount = Number(subtotal) || 0;
  if (coupon.minOrderAmount && orderAmount < coupon.minOrderAmount) {
    return res.status(400).json({
      message: `Minimum order value of ₹${coupon.minOrderAmount} required for coupon ${cleanCode}`,
    });
  }

  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = Math.round((orderAmount * coupon.discountAmount) / 100);
    if (coupon.maxDiscount > 0 && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  } else {
    discount = Math.min(orderAmount, coupon.discountAmount);
  }

  return res.json({
    valid: true,
    code: coupon.code,
    discountType: coupon.discountType,
    discountAmount: coupon.discountAmount,
    calculatedDiscount: discount,
    message: `Coupon "${coupon.code}" applied! You save ₹${discount}`,
  });
};

export const getAdminCoupons = async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  return res.json({ coupons });
};

export const createCoupon = async (req, res) => {
  const {
    code,
    description,
    discountType,
    discountAmount,
    minOrderAmount,
    maxDiscount,
    usageLimit,
    validUntil,
    isActive,
  } = req.body;

  if (!code || discountAmount === undefined) {
    return res.status(400).json({ message: "Coupon code and discount amount are required" });
  }

  const cleanCode = code.trim().toUpperCase();
  const existing = await Coupon.findOne({ code: cleanCode });
  if (existing) {
    return res.status(409).json({ message: `Coupon code "${cleanCode}" already exists` });
  }

  const coupon = await Coupon.create({
    code: cleanCode,
    description: description || "",
    discountType: discountType || "fixed",
    discountAmount: Number(discountAmount),
    minOrderAmount: Number(minOrderAmount) || 0,
    maxDiscount: Number(maxDiscount) || 0,
    usageLimit: Number(usageLimit) || 1000,
    validUntil: validUntil ? new Date(validUntil) : undefined,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  });

  return res.status(201).json({ coupon, message: "Coupon created successfully" });
};

export const updateCoupon = async (req, res) => {
  const { id } = req.params;
  const coupon = await Coupon.findById(id);
  if (!coupon) return res.status(404).json({ message: "Coupon not found" });

  const {
    code,
    description,
    discountType,
    discountAmount,
    minOrderAmount,
    maxDiscount,
    usageLimit,
    validUntil,
    isActive,
  } = req.body;

  if (code) {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode !== coupon.code) {
      const existing = await Coupon.findOne({ code: cleanCode, _id: { $ne: id } });
      if (existing) return res.status(409).json({ message: `Coupon "${cleanCode}" already exists` });
      coupon.code = cleanCode;
    }
  }
  if (description !== undefined) coupon.description = description;
  if (discountType !== undefined) coupon.discountType = discountType;
  if (discountAmount !== undefined) coupon.discountAmount = Number(discountAmount);
  if (minOrderAmount !== undefined) coupon.minOrderAmount = Number(minOrderAmount);
  if (maxDiscount !== undefined) coupon.maxDiscount = Number(maxDiscount);
  if (usageLimit !== undefined) coupon.usageLimit = Number(usageLimit);
  if (validUntil !== undefined) coupon.validUntil = validUntil ? new Date(validUntil) : undefined;
  if (isActive !== undefined) coupon.isActive = Boolean(isActive);

  await coupon.save();
  return res.json({ coupon, message: "Coupon updated successfully" });
};

export const deleteCoupon = async (req, res) => {
  const { id } = req.params;
  const coupon = await Coupon.findByIdAndDelete(id);
  if (!coupon) return res.status(404).json({ message: "Coupon not found" });
  return res.json({ message: `Coupon "${coupon.code}" deleted successfully` });
};
