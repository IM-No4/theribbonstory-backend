import Category from "../models/Category.js";
import Product from "../models/Product.js";

const slugify = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const getCategories = async (req, res) => {
  const categories = await Category.find({ isActive: { $ne: false } }).sort({ order: 1, createdAt: 1 });
  return res.json({ categories });
};

export const getCategoryBySlug = async (req, res) => {
  const category = await Category.findOne({ slug: req.params.slug });
  if (!category) return res.status(404).json({ message: "Category/Collection not found" });
  return res.json({ category });
};

export const getAdminCategories = async (req, res) => {
  const categories = await Category.find().sort({ order: 1, createdAt: 1 });
  // Attach product counts
  const categoriesWithCount = await Promise.all(
    categories.map(async (cat) => {
      const productCount = await Product.countDocuments({ category: cat.slug });
      return {
        ...cat.toObject(),
        productCount,
      };
    })
  );
  return res.json({ categories: categoriesWithCount });
};

export const createCategory = async (req, res) => {
  const { name, slug, description, image, badge, order, isFeatured, isActive } = req.body;
  if (!name) return res.status(400).json({ message: "Category name is required" });

  const finalSlug = slug ? slugify(slug) : slugify(name);
  const existing = await Category.findOne({ slug: finalSlug });
  if (existing) {
    return res.status(409).json({ message: `A category with slug "${finalSlug}" already exists` });
  }

  const category = await Category.create({
    name,
    slug: finalSlug,
    description: description || "",
    image: image || "",
    badge: badge || "",
    order: Number(order) || 0,
    isFeatured: Boolean(isFeatured),
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  });

  return res.status(201).json({ category, message: "Category created successfully" });
};

export const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, slug, description, image, badge, order, isFeatured, isActive } = req.body;

  const category = await Category.findById(id);
  if (!category) return res.status(404).json({ message: "Category not found" });

  if (name) category.name = name;
  if (slug) {
    const finalSlug = slugify(slug);
    if (finalSlug !== category.slug) {
      const existing = await Category.findOne({ slug: finalSlug, _id: { $ne: id } });
      if (existing) return res.status(409).json({ message: `A category with slug "${finalSlug}" already exists` });
      // Also update products with old category slug to new slug if needed
      await Product.updateMany({ category: category.slug }, { category: finalSlug });
      category.slug = finalSlug;
    }
  }
  if (description !== undefined) category.description = description;
  if (image !== undefined) category.image = image;
  if (badge !== undefined) category.badge = badge;
  if (order !== undefined) category.order = Number(order);
  if (isFeatured !== undefined) category.isFeatured = Boolean(isFeatured);
  if (isActive !== undefined) category.isActive = Boolean(isActive);

  await category.save();
  return res.json({ category, message: "Category updated successfully" });
};

export const deleteCategory = async (req, res) => {
  const { id } = req.params;
  const category = await Category.findById(id);
  if (!category) return res.status(404).json({ message: "Category not found" });

  const productCount = await Product.countDocuments({ category: category.slug });
  await Category.findByIdAndDelete(id);

  return res.json({
    message: `Category "${category.name}" deleted. (${productCount} products were in this category)`,
  });
};
