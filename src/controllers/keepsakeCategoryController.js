import KeepsakeCategory from "../models/KeepsakeCategory.js";

const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const DEFAULT_KEEPSAKE_CATEGORIES = [
  {
    name: "Single",
    slug: "single",
    tagline: "Solo portrait & character",
    icon: "👤",
    description: "Perfect for personal portraits, self-avatars, graduates, and individual gift sculpts.",
    order: 1,
    isActive: true,
    engravingSuggestions: [
      "Dream Big ✨",
      "Self Love First 💖",
      "Living My Best Life ⭐",
      "Born to Shine 💫",
      "Class of 2026 🎓",
      "One & Only 🌟",
    ],
    image: "/images/3d-single-keepsake.jpg",
    pricingOptions: [
      {
        name: "Small Desk",
        dimensions: '3.5" (9 cm)',
        price: 699,
        compareAtPrice: 1199,
        description: "Compact desktop & bedside display",
        isPopular: false,
        order: 1,
      },
      {
        name: "Classic Studio",
        dimensions: '5.5" (14 cm)',
        price: 1199,
        compareAtPrice: 1999,
        description: "Most loved • Detailed portrait with display base",
        isPopular: true,
        order: 2,
      },
      {
        name: "Grand Collector",
        dimensions: '7.5" (19 cm)',
        price: 1899,
        compareAtPrice: 2999,
        description: "Collector edition • Maximum detail & presence",
        isPopular: false,
        order: 3,
      },
    ],
  },
  {
    name: "Couple",
    slug: "couple",
    tagline: "Anniversaries & couples",
    icon: "💑",
    description: "Two figures sculpted together in harmony on an elegant display base.",
    order: 2,
    isActive: true,
    image: "/images/3d-couple-keepsake.webp",
    engravingSuggestions: [
      "Forever & Always ❤️",
      "Happy Anniversary 🥂",
      "You & Me Always 💖",
      "Better Together 💑",
      "From Day One 💍",
      "My Favorite Person ✨",
    ],
    pricingOptions: [
      {
        name: "Studio Duo",
        dimensions: '5.0" (13 cm)',
        price: 1499,
        compareAtPrice: 2399,
        description: "Compact dual figure sculpt",
        isPopular: false,
        order: 1,
      },
      {
        name: "Signature Couple",
        dimensions: '6.5" (16.5 cm)',
        price: 2199,
        compareAtPrice: 3499,
        description: "Most loved • Finely sculpted couple with walnut base",
        isPopular: true,
        order: 2,
      },
      {
        name: "Grand Wedding",
        dimensions: '8.0" (20 cm)',
        price: 2999,
        compareAtPrice: 4699,
        description: "Deluxe centerpiece with personalized plaque",
        isPopular: false,
        order: 3,
      },
    ],
  },
  {
    name: "Family",
    slug: "family",
    tagline: "3–5 Family members",
    icon: "👨‍👩‍👧",
    description: "Heartwarming multi-figure family portrait capturing loved ones together.",
    order: 3,
    isActive: true,
    image: "/images/3d-family-keepsake.webp",
    engravingSuggestions: [
      "Family First 👨‍👩‍👧",
      "Our Happy Place 🏡",
      "Together is Beautiful 🤍",
      "The Best Memories 🌻",
      "Roots & Wings 🌳",
      "Love Lives Here 💕",
    ],
    pricingOptions: [
      {
        name: "Family Studio",
        dimensions: '5.5" (14 cm wide)',
        price: 2499,
        compareAtPrice: 3999,
        description: "Up to 3 family members in group sculpt",
        isPopular: false,
        order: 1,
      },
      {
        name: "Family Deluxe",
        dimensions: '7.0" (18 cm wide)',
        price: 3499,
        compareAtPrice: 5499,
        description: "Most loved • Up to 5 figures with custom base engraving",
        isPopular: true,
        order: 2,
      },
      {
        name: "Heritage Grand",
        dimensions: '9.0" (23 cm wide)',
        price: 4499,
        compareAtPrice: 6999,
        description: "Masterpiece heirloom display with protective packaging",
        isPopular: false,
        order: 3,
      },
    ],
  },
  {
    name: "Kid & Baby",
    slug: "kid",
    tagline: "Children & milestones",
    icon: "👶",
    description: "Capture growing milestones, childhood joy, and precious baby memories.",
    order: 4,
    isActive: true,
    image: "/images/3d-kid-keepsake.jpg",
    engravingSuggestions: [
      "Our Little Wonder ✨",
      "Tiny Hands, Big Heart 👣",
      "First Steps 🍼",
      "Pure Joy 🎈",
      "Our Sunshine ☀️",
      "Sweet Little One 🧸",
    ],
    pricingOptions: [
      {
        name: "Mini Cutie",
        dimensions: '3.5" (9 cm)',
        price: 649,
        compareAtPrice: 1099,
        description: "Adorable compact keepsake for desks and shelves",
        isPopular: false,
        order: 1,
      },
      {
        name: "Birthday Hero",
        dimensions: '5.0" (13 cm)',
        price: 1099,
        compareAtPrice: 1799,
        description: "Most loved • Includes birthdate or name badge",
        isPopular: true,
        order: 2,
      },
      {
        name: "Nursery Deluxe",
        dimensions: '6.5" (16.5 cm)',
        price: 1699,
        compareAtPrice: 2699,
        description: "Deluxe display with engraved wooden pedestal",
        isPopular: false,
        order: 3,
      },
    ],
  },
  {
    name: "Pet",
    slug: "pet",
    tagline: "Dogs, cats & furry companions",
    icon: "🐾",
    description: "Detailed lifelike 3D sculpt of your beloved dog, cat, or companion animal.",
    order: 5,
    isActive: true,
    image: "/images/3d-dog-keepsake.webp",
    engravingSuggestions: [
      "Best Friends 🐾",
      "Forever in Our Hearts 🐶",
      "Good Boy / Girl 🎾",
      "Paws & Claws 🐾",
      "Furry Little Monster 🐱",
      "Unconditional Love 🦴",
    ],
    pricingOptions: [
      {
        name: "Pocket Pet",
        dimensions: '3.5" (9 cm)',
        price: 699,
        compareAtPrice: 1199,
        description: "True coat color matching & adorable posture",
        isPopular: false,
        order: 1,
      },
      {
        name: "Furry Friend",
        dimensions: '5.0" (13 cm)',
        price: 1199,
        compareAtPrice: 1999,
        description: "Most loved • Realistic fur textures and collar accent",
        isPopular: true,
        order: 2,
      },
      {
        name: "Royal Pet Monument",
        dimensions: '7.0" (18 cm)',
        price: 1899,
        compareAtPrice: 2999,
        description: "Memorial or celebratory mantle centerpiece with plaque",
        isPopular: false,
        order: 3,
      },
    ],
  },
];

const DEFAULT_SLUG_IMAGES = {
  single: "/images/3d-single-keepsake.jpg",
  couple: "/images/3d-couple-keepsake.webp",
  family: "/images/3d-family-keepsake.webp",
  kid: "/images/3d-kid-keepsake.jpg",
  baby: "/images/3d-kid-keepsake.jpg",
  "kid-baby": "/images/3d-kid-keepsake.jpg",
  pet: "/images/3d-dog-keepsake.webp",
};

/**
 * Public: Get all active Keepsake Categories with their pricing options
 * If the collection is brand new, automatically initializes the curated default categories.
 */
export const getPublicKeepsakeCategories = async (req, res) => {
  let categories = await KeepsakeCategory.find({ isActive: true }).sort({ order: 1, createdAt: 1 });

  if (!categories || categories.length === 0) {
    const count = await KeepsakeCategory.countDocuments();
    if (count === 0) {
      await KeepsakeCategory.insertMany(DEFAULT_KEEPSAKE_CATEGORIES);
      categories = await KeepsakeCategory.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    }
  } else {
    // Backfill images for any existing categories that don't have one set yet
    let needsUpdate = false;
    for (const cat of categories) {
      if (!cat.image && DEFAULT_SLUG_IMAGES[cat.slug]) {
        cat.image = DEFAULT_SLUG_IMAGES[cat.slug];
        await KeepsakeCategory.updateOne({ _id: cat._id }, { $set: { image: cat.image } });
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      categories = await KeepsakeCategory.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    }
  }

  res.json({ success: true, categories });
};

/**
 * Admin: Get all Keepsake Categories (active and inactive)
 */
export const getAdminKeepsakeCategories = async (req, res) => {
  let categories = await KeepsakeCategory.find().sort({ order: 1, createdAt: 1 });
  if (!categories || categories.length === 0) {
    await KeepsakeCategory.insertMany(DEFAULT_KEEPSAKE_CATEGORIES);
    categories = await KeepsakeCategory.find().sort({ order: 1, createdAt: 1 });
  } else {
    for (const cat of categories) {
      if (!cat.image && DEFAULT_SLUG_IMAGES[cat.slug]) {
        cat.image = DEFAULT_SLUG_IMAGES[cat.slug];
        await KeepsakeCategory.updateOne({ _id: cat._id }, { $set: { image: cat.image } });
      }
    }
    categories = await KeepsakeCategory.find().sort({ order: 1, createdAt: 1 });
  }
  res.json({ success: true, categories });
};

/**
 * Admin: Create a new Keepsake Category
 */
export const createKeepsakeCategory = async (req, res) => {
  const { name, slug, tagline, icon, image, description, order, isActive, pricingOptions, engravingSuggestions } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: "Category name is required" });
  }

  const finalSlug = slugify(slug || name);
  const exists = await KeepsakeCategory.findOne({ slug: finalSlug });
  if (exists) {
    return res.status(400).json({ success: false, message: `Category with slug "${finalSlug}" already exists` });
  }

  const category = await KeepsakeCategory.create({
    name: name.trim(),
    slug: finalSlug,
    tagline: tagline ? tagline.trim() : "",
    icon: icon ? icon.trim() : "👤",
    image: image ? image.trim() : (DEFAULT_SLUG_IMAGES[finalSlug] || ""),
    description: description ? description.trim() : "",
    order: Number(order) || 0,
    isActive: typeof isActive === "boolean" ? isActive : true,
    pricingOptions: Array.isArray(pricingOptions) ? pricingOptions : [],
    engravingSuggestions: Array.isArray(engravingSuggestions) ? engravingSuggestions : [],
  });

  res.status(201).json({ success: true, category });
};

/**
 * Admin: Update a Keepsake Category
 */
export const updateKeepsakeCategory = async (req, res) => {
  const { id } = req.params;
  const category = await KeepsakeCategory.findById(id);

  if (!category) {
    return res.status(404).json({ success: false, message: "Keepsake category not found" });
  }

  const { name, slug, tagline, icon, image, description, order, isActive, pricingOptions, engravingSuggestions } = req.body;

  if (name !== undefined) category.name = name.trim();
  if (slug !== undefined) {
    const finalSlug = slugify(slug);
    if (finalSlug !== category.slug) {
      const conflict = await KeepsakeCategory.findOne({ slug: finalSlug, _id: { $ne: id } });
      if (conflict) {
        return res.status(400).json({ success: false, message: `Slug "${finalSlug}" is already taken` });
      }
      category.slug = finalSlug;
    }
  }
  if (tagline !== undefined) category.tagline = tagline.trim();
  if (icon !== undefined) category.icon = icon.trim();
  if (image !== undefined) category.image = image.trim();
  if (description !== undefined) category.description = description.trim();
  if (order !== undefined) category.order = Number(order) || 0;
  if (isActive !== undefined) category.isActive = Boolean(isActive);
  if (Array.isArray(pricingOptions)) category.pricingOptions = pricingOptions;
  if (Array.isArray(engravingSuggestions)) category.engravingSuggestions = engravingSuggestions;

  await category.save();
  res.json({ success: true, category });
};

/**
 * Admin: Delete a Keepsake Category
 */
export const deleteKeepsakeCategory = async (req, res) => {
  const { id } = req.params;
  const category = await KeepsakeCategory.findByIdAndDelete(id);

  if (!category) {
    return res.status(404).json({ success: false, message: "Keepsake category not found" });
  }

  res.json({ success: true, message: `Category "${category.name}" removed successfully` });
};

/**
 * Admin: Reset or repopulate default categories
 */
export const resetToDefaults = async (req, res) => {
  await KeepsakeCategory.deleteMany({});
  const categories = await KeepsakeCategory.insertMany(DEFAULT_KEEPSAKE_CATEGORIES);
  res.json({ success: true, message: "Reset to default keepsake categories successfully", categories });
};
