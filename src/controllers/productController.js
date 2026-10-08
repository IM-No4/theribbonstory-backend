import Product from "../models/Product.js";
import Category from "../models/Category.js";
import { OCCASIONS } from "../utils/occasions.js";
import { escapeRegex, isObjectId } from "../utils/security.js";
import { deletePrintFile, printFilePath } from "../middleware/printFileUpload.js";

const slugify = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const getProducts = async (req, res) => {
  const { category, occasion, search, featured, bestseller, sort, minPrice, maxPrice, tag } = req.query;
  const filter = { isActive: { $ne: false } };

  if (category && category !== "all") filter.category = category;
  if (occasion && occasion !== "all") filter.occasions = occasion;
  if (tag) filter.tags = tag;
  if (featured === "true") filter.isFeatured = true;
  if (bestseller === "true") filter.isBestseller = true;
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }
  if (search) {
    const pattern = new RegExp(escapeRegex(String(search).slice(0, 100)), "i");
    filter.$or = [{ name: pattern }, { description: pattern }, { tagline: pattern }, { tags: pattern }];
  }

  let query = Product.find(filter);

  switch (sort) {
    case "price-asc":
      query = query.sort({ price: 1 });
      break;
    case "price-desc":
      query = query.sort({ price: -1 });
      break;
    case "rating":
      query = query.sort({ rating: -1 });
      break;
    default:
      query = query.sort({ isFeatured: -1, createdAt: -1 });
  }

  const products = await query.exec();
  return res.json({ products, count: products.length });
};

export const getProductBySlug = async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug });
  if (!product) return res.status(404).json({ message: "Product not found" });
  return res.json({ product });
};

export const getCategories = async (req, res) => {
  const categories = await Category.find({ isActive: { $ne: false } }).sort({ order: 1, createdAt: 1 });
  return res.json({ categories });
};

export const getOccasions = async (req, res) => {
  return res.json({ occasions: OCCASIONS });
};

// Admin Controllers
export const getAdminProducts = async (req, res) => {
  const { category, search, sort } = req.query;
  const filter = {};
  if (category && category !== "all") filter.category = category;
  if (search) {
    const pattern = new RegExp(escapeRegex(String(search).slice(0, 100)), "i");
    filter.$or = [{ name: pattern }, { slug: pattern }, { description: pattern }];
  }

  // Admins see whether a print file is attached (never sent to customers)
  let query = Product.find(filter).select("+printFile");
  if (sort === "price-asc") query = query.sort({ price: 1 });
  else if (sort === "price-desc") query = query.sort({ price: -1 });
  else if (sort === "stock-asc") query = query.sort({ stock: 1 });
  else query = query.sort({ createdAt: -1 });

  const products = await query.exec();
  return res.json({ products, count: products.length });
};

export const createProduct = async (req, res) => {
  const {
    name,
    slug,
    category,
    tagline,
    description,
    price,
    compareAtPrice,
    images,
    accentColor,
    isCustomizable,
    customizationPrompt,
    optionGroups,
    occasions,
    tags,
    stock,
    isFeatured,
    isBestseller,
    isActive,
  } = req.body;

  if (!name || price === undefined || !category) {
    return res.status(400).json({ message: "Product name, category, and price are required." });
  }

  let finalSlug = slug ? slugify(slug) : slugify(name);
  const existing = await Product.findOne({ slug: finalSlug });
  if (existing) {
    finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
  }

  const product = await Product.create({
    name,
    slug: finalSlug,
    category,
    tagline: tagline || "",
    description: description || "",
    price: Number(price),
    compareAtPrice: compareAtPrice ? Number(compareAtPrice) : undefined,
    images: Array.isArray(images) && images.length > 0 ? images : ["/images/photo-magnet.webp"],
    accentColor: accentColor || "#a83f52",
    isCustomizable: Boolean(isCustomizable),
    customizationPrompt: customizationPrompt || "Upload your favourite photo",
    optionGroups: Array.isArray(optionGroups) ? optionGroups : [],
    occasions: Array.isArray(occasions) ? occasions : [],
    tags: Array.isArray(tags) ? tags : [],
    stock: stock !== undefined ? Number(stock) : 100,
    isFeatured: Boolean(isFeatured),
    isBestseller: Boolean(isBestseller),
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  });

  return res.status(201).json({ product, message: "Product created successfully" });
};

export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const product = await Product.findById(id);
  if (!product) return res.status(404).json({ message: "Product not found" });

  const {
    name,
    slug,
    category,
    tagline,
    description,
    price,
    compareAtPrice,
    images,
    accentColor,
    isCustomizable,
    customizationPrompt,
    optionGroups,
    occasions,
    tags,
    stock,
    isFeatured,
    isBestseller,
    isActive,
    rating,
    reviewCount,
  } = req.body;

  if (name !== undefined) product.name = name;
  if (slug !== undefined) {
    const finalSlug = slugify(slug);
    if (finalSlug !== product.slug) {
      const existing = await Product.findOne({ slug: finalSlug, _id: { $ne: id } });
      if (existing) return res.status(409).json({ message: `A product with slug "${finalSlug}" already exists` });
      product.slug = finalSlug;
    }
  }
  if (category !== undefined) product.category = category;
  if (tagline !== undefined) product.tagline = tagline;
  if (description !== undefined) product.description = description;
  if (price !== undefined) product.price = Number(price);
  if (compareAtPrice !== undefined) product.compareAtPrice = compareAtPrice ? Number(compareAtPrice) : undefined;
  if (images !== undefined) product.images = images;
  if (accentColor !== undefined) product.accentColor = accentColor;
  if (isCustomizable !== undefined) product.isCustomizable = Boolean(isCustomizable);
  if (customizationPrompt !== undefined) product.customizationPrompt = customizationPrompt;
  if (optionGroups !== undefined) product.optionGroups = optionGroups;
  if (occasions !== undefined) product.occasions = occasions;
  if (tags !== undefined) product.tags = tags;
  if (stock !== undefined) product.stock = Number(stock);
  if (isFeatured !== undefined) product.isFeatured = Boolean(isFeatured);
  if (isBestseller !== undefined) product.isBestseller = Boolean(isBestseller);
  if (isActive !== undefined) product.isActive = Boolean(isActive);
  if (rating !== undefined) product.rating = Number(rating);
  if (reviewCount !== undefined) product.reviewCount = Number(reviewCount);

  await product.save();
  return res.json({ product, message: "Product updated successfully" });
};

export const deleteProduct = async (req, res) => {
  const { id } = req.params;
  const product = await Product.findByIdAndDelete(id).select("+printFile");
  if (!product) return res.status(404).json({ message: "Product not found" });
  if (product.printFile?.filename) deletePrintFile(product.printFile.filename);
  return res.json({ message: `Product "${product.name}" deleted successfully` });
};

/**
 * Admin: attach or replace a product's production print file (STL/3MF/OBJ)
 */
export const uploadProductPrintFile = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Please choose a print file to upload" });
  const discardUpload = () => deletePrintFile(req.file.filename);

  if (!isObjectId(req.params.id)) {
    discardUpload();
    return res.status(400).json({ message: "Invalid product" });
  }
  const product = await Product.findById(req.params.id).select("+printFile");
  if (!product) {
    discardUpload();
    return res.status(404).json({ message: "Product not found" });
  }

  const previous = product.printFile?.filename;
  product.printFile = {
    filename: req.file.filename,
    originalName: req.file.originalname.slice(0, 200),
    size: req.file.size,
    uploadedAt: new Date(),
  };
  await product.save();
  if (previous && previous !== req.file.filename) deletePrintFile(previous);

  return res.status(201).json({ printFile: product.printFile, message: "Print file attached" });
};

/**
 * Admin: download a product's print file
 */
export const downloadProductPrintFile = async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product" });
  const product = await Product.findById(req.params.id).select("+printFile");
  const file = product?.printFile?.filename && printFilePath(product.printFile.filename);
  if (!file) return res.status(404).json({ message: "No print file attached to this product" });

  res.set("Cache-Control", "private, no-store");
  return res.download(file, product.printFile.originalName || product.printFile.filename, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: "Print file is missing on the server" });
  });
};

/**
 * Admin: remove a product's print file
 */
export const deleteProductPrintFile = async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product" });
  const product = await Product.findById(req.params.id).select("+printFile");
  if (!product) return res.status(404).json({ message: "Product not found" });
  if (product.printFile?.filename) deletePrintFile(product.printFile.filename);
  product.printFile = undefined;
  await product.save();
  return res.json({ message: "Print file removed" });
};
