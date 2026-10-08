import Review from "../models/Review.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import { isObjectId } from "../utils/security.js";

// Helper to recalculate product rating
const recalculateProductRating = async (productId) => {
  const reviews = await Review.find({ product: productId, isApproved: true });
  const reviewCount = reviews.length;
  const avgRating = reviewCount > 0
    ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount).toFixed(1))
    : 5.0;

  await Product.findByIdAndUpdate(productId, { rating: avgRating, reviewCount });
};

export const getProductReviews = async (req, res) => {
  const { productId } = req.params;
  const reviews = await Review.find({ product: productId, isApproved: true }).sort({ createdAt: -1 });

  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const star = Math.min(5, Math.max(1, Math.round(r.rating)));
    distribution[star] = (distribution[star] || 0) + 1;
  });

  const totalReviews = reviews.length;
  const averageRating = totalReviews > 0
    ? Number((reviews.reduce((s, r) => s + r.rating, 0) / totalReviews).toFixed(1))
    : 4.9;

  return res.json({
    reviews,
    totalReviews,
    averageRating,
    distribution,
  });
};

export const createReview = async (req, res) => {
  const { productId, rating, title, comment, photos } = req.body;

  if (!productId || !rating || !comment) {
    return res.status(400).json({ message: "Product, rating, and comment are required." });
  }

  if (!isObjectId(productId)) return res.status(400).json({ message: "Invalid product" });
  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: "Product not found" });

  // Only customers who actually ordered the product get a verified, auto-published review
  const hasPurchased = await Order.exists({
    user: req.user._id,
    "items.product": product._id,
    status: { $ne: "cancelled" },
  });

  const review = await Review.create({
    product: productId,
    user: req.user._id,
    userName: req.user.name,
    userCity: req.user.addresses?.[0]?.city || "Verified Buyer",
    rating: Math.min(5, Math.max(1, Math.round(Number(rating)) || 5)),
    title: String(title || "").slice(0, 150),
    comment: String(comment).slice(0, 3000),
    photos: (Array.isArray(photos) ? photos : [])
      .filter((p) => typeof p === "string" && p.startsWith("/uploads/"))
      .slice(0, 5),
    isVerifiedPurchase: Boolean(hasPurchased),
    isApproved: Boolean(hasPurchased),
  });

  await recalculateProductRating(productId);

  return res.status(201).json({
    review,
    message: review.isApproved
      ? "Thank you! Your review has been published."
      : "Thank you! Your review will appear once our team has approved it.",
  });
};

export const getAdminReviews = async (req, res) => {
  const reviews = await Review.find()
    .populate("product", "name images slug")
    .sort({ createdAt: -1 });
  return res.json({ reviews });
};

export const toggleApproveReview = async (req, res) => {
  const { id } = req.params;
  const review = await Review.findById(id);
  if (!review) return res.status(404).json({ message: "Review not found" });

  review.isApproved = !review.isApproved;
  await review.save();
  await recalculateProductRating(review.product);

  return res.json({ review, message: `Review ${review.isApproved ? "approved" : "hidden"}` });
};

export const deleteReview = async (req, res) => {
  const { id } = req.params;
  const review = await Review.findByIdAndDelete(id);
  if (!review) return res.status(404).json({ message: "Review not found" });

  await recalculateProductRating(review.product);
  return res.json({ message: "Review deleted successfully" });
};
