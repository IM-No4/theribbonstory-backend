import crypto from "crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { pathToFileURL } from "url";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import User from "../models/User.js";
import Coupon from "../models/Coupon.js";
import Review from "../models/Review.js";
import { placeholderImage } from "./placeholderImage.js";

const slugify = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const initialCategories = [
  {
    name: "3D Keepsakes",
    slug: "3d-keepsakes",
    description: "Bespoke miniature 3D casts and sculptures crafted from your photos",
    image: "/images/3d-dog-keepsake.webp",
    badge: "Hot",
    order: 1,
    isFeatured: true,
  },
  {
    name: "Photo Magnets",
    slug: "photo-magnets",
    description: "Crystal acrylic photo magnets freezing your favorite memories",
    image: "/images/photo-magnet.webp",
    badge: "Trending",
    order: 2,
    isFeatured: true,
  },
  {
    name: "Polaroid Art",
    slug: "polaroid-magnets",
    description: "Vintage polaroid-framed magnets with custom handwritten captions",
    image: "/images/polaroid-art.webp",
    badge: "Best Value",
    order: 3,
    isFeatured: true,
  },
  {
    name: "Custom Name Magnets",
    slug: "personalized-name-magnets",
    description: "Monogrammed dates, initials & meaningful engraved keepsakes",
    image: "/images/for-couples.webp",
    badge: "Popular",
    order: 4,
    isFeatured: true,
  },
  {
    name: "Travel Magnets",
    slug: "travel-memory-magnets",
    description: "Passport moments turned into permanent souvenir keepsakes",
    image: "/images/same-day-delivery.webp",
    badge: "New",
    order: 5,
    isFeatured: true,
  },
  {
    name: "Gift Hampers",
    slug: "gift-hampers",
    description: "Curated luxury ribbon gift hampers paired with custom keepsakes",
    image: "/images/gifts-for-her.webp",
    badge: "Luxury",
    order: 6,
    isFeatured: true,
  },
  {
    name: "Keepsake Keychains",
    slug: "future-keepsakes",
    description: "Portable double-sided photo & message acrylic keychains",
    image: "/images/pet-keepsake.webp",
    badge: "Accessories",
    order: 7,
    isFeatured: false,
  },
];

const freezeMagnetOptions = [
  {
    name: "Shape & Style",
    values: [
      { label: "Classic Square Acrylic", priceDelta: 0 },
      { label: "Rounded Heart Frame", priceDelta: 50 },
      { label: "Polaroid Border Frame", priceDelta: 60 },
      { label: "Arch Gallery Cut", priceDelta: 40 },
    ],
  },
  {
    name: "Size",
    values: [
      { label: "3 x 3 in (Standard)", priceDelta: 0 },
      { label: "4 x 4 in (Large)", priceDelta: 100 },
      { label: "5 x 5 in (Statement)", priceDelta: 180 },
    ],
  },
];

const threeDOptions = [
  {
    name: "3D Style Finish",
    values: [
      { label: "Minimalist Pastel Sculpt", priceDelta: 0 },
      { label: "Cute Chibi Character", priceDelta: 50 },
      { label: "Detailed Textured Sculpt", priceDelta: 100 },
    ],
  },
  {
    name: "Display Mounting",
    values: [
      { label: "Strong Magnet Back", priceDelta: 0 },
      { label: "Dual Desk Stand + Magnet", priceDelta: 79 },
    ],
  },
];

const products = [
  {
    name: "Personalized Photo Magnet",
    category: "photo-magnets",
    tagline: "Your favorite memory, frozen in crystal acrylic",
    description: "A crystal-clear acrylic photo magnet that transforms your favorite picture into a glossy keepsake. Upload any photo and we'll hand-finish it into a timeless piece for your fridge.",
    price: 349,
    compareAtPrice: 449,
    images: ["/images/photo-magnet.webp"],
    isCustomizable: true,
    customizationPrompt: "Upload photo, select shape and add custom message",
    optionGroups: freezeMagnetOptions,
    occasions: ["anniversary", "birthday", "wedding", "just-because", "couples", "family"],
    tags: ["bestseller", "photo magnet", "acrylic", "personalized"],
    isFeatured: true,
    isBestseller: true,
    rating: 4.9,
    reviewCount: 38,
    icon: "magnet",
  },
  {
    name: "Polaroid Memory Magnet",
    category: "polaroid-magnets",
    tagline: "Retro polaroid frame with your personal story",
    description: "Nostalgic white-bordered polaroid style reimagined as a scratch-resistant, glossy keepsake magnet. Add custom handwritten text or date along the bottom margin.",
    price: 359,
    compareAtPrice: 429,
    images: ["/images/polaroid-art.webp"],
    isCustomizable: true,
    customizationPrompt: "Upload photo and add handwritten text for the polaroid margin",
    optionGroups: freezeMagnetOptions,
    occasions: ["birthday", "friendship", "couples", "just-because"],
    tags: ["bestseller", "polaroid", "retro", "photo magnet"],
    isFeatured: true,
    isBestseller: true,
    rating: 4.8,
    reviewCount: 29,
    icon: "magnet",
  },
  {
    name: "3D Couple Magnet",
    category: "3d-keepsakes",
    tagline: "Turn your love story into a miniature 3D keepsake",
    description: "A custom 3D-sculpted magnet created from your favorite photo together. Hand-painted finish with incredible depth, turning your special moment into a physical figurine keepsake.",
    price: 699,
    compareAtPrice: 849,
    images: ["/images/3d-couple-keepsake.webp"],
    isCustomizable: true,
    customizationPrompt: "Upload a clear couple photo and select your preferred 3D sculpting style",
    optionGroups: threeDOptions,
    occasions: ["anniversary", "wedding", "valentines-day", "couples"],
    tags: ["bestseller", "3d keepsake", "couple gift", "featured"],
    isFeatured: true,
    isBestseller: true,
    rating: 5.0,
    reviewCount: 45,
    icon: "magnet",
  },
  {
    name: "3D Pet Magnet",
    category: "3d-keepsakes",
    tagline: "Your favorite face, made into a tiny keepsake",
    description: "Turn your dog, cat, or pet companion into a realistic 3D magnet! Meticulously sculpted and painted from your pet's photo to capture every little detail and cute expression.",
    price: 599,
    compareAtPrice: 749,
    images: ["/images/3d-dog-keepsake.webp", "/images/3d-cat-keepsake.webp"],
    isCustomizable: true,
    customizationPrompt: "Upload your pet photo and enter your pet's name for custom engraving",
    optionGroups: threeDOptions,
    occasions: ["pets", "birthday", "just-because"],
    tags: ["bestseller", "3d pet", "dog", "cat", "featured"],
    isFeatured: true,
    isBestseller: true,
    rating: 4.9,
    reviewCount: 52,
    icon: "heart",
  },
  {
    name: "3D Baby Hand & Foot Cast Keepsake",
    category: "3d-keepsakes",
    tagline: "Tiny hands and little feet, preserved forever",
    description: "Delicate pearlescent 3D casts of baby handprints and footprints accented with rose gold details, mounted in a luxury shadow box tied with satin ribbon.",
    price: 1199,
    compareAtPrice: 1499,
    images: ["/images/3d-baby-keepsake.webp"],
    isCustomizable: true,
    customizationPrompt: "Upload baby imprint photo and enter baby name and birth date",
    optionGroups: threeDOptions,
    occasions: ["baby", "birthday", "family"],
    tags: ["3d baby", "handprint", "footprint", "keepsake"],
    isFeatured: true,
    isBestseller: true,
    rating: 5.0,
    reviewCount: 27,
    icon: "heart",
  },
  {
    name: "Custom Name & Date Magnet",
    category: "personalized-name-magnets",
    tagline: "Monogrammed dates, initials & meaningful quotes",
    description: "Elegant wooden & acrylic hybrid magnet engraved with your names, special anniversary date, or secret coordinates. A subtle statement keepsake.",
    price: 399,
    images: ["/images/for-couples.webp"],
    isCustomizable: true,
    customizationPrompt: "Enter primary text (e.g. Names or Initials) and secondary date/line",
    optionGroups: freezeMagnetOptions,
    occasions: ["anniversary", "wedding", "housewarming"],
    tags: ["custom name", "date magnet", "minimalist"],
    isFeatured: true,
    isBestseller: false,
    rating: 4.7,
    reviewCount: 16,
    icon: "magnet",
  },
  {
    name: "Travel Memory Magnet",
    category: "travel-memory-magnets",
    tagline: "Passport moments turned into permanent souvenirs",
    description: "Turn vacation snapshots into stamp-edged travel magnets complete with destination coordinates and travel dates. Outlasts any generic tourist gift shop souvenir.",
    price: 379,
    images: ["/images/same-day-delivery.webp"],
    isCustomizable: true,
    customizationPrompt: "Upload travel photo, enter destination name and date",
    optionGroups: freezeMagnetOptions,
    occasions: ["friendship", "just-because", "couples"],
    tags: ["travel", "souvenir", "vacation"],
    isFeatured: true,
    isBestseller: true,
    rating: 4.8,
    reviewCount: 22,
    icon: "magnet",
  },
  {
    name: "Custom 3D Family Magnet",
    category: "3d-keepsakes",
    tagline: "Keep the people who matter closest",
    description: "A multi-figure 3D sculpted keepsake capturing your whole family in one beautiful custom piece. Made from your favorite family portrait photo.",
    price: 899,
    compareAtPrice: 1099,
    images: ["/images/3d-family-keepsake.webp"],
    isCustomizable: true,
    customizationPrompt: "Upload family photo, enter family surname, and pick sculpting style",
    optionGroups: threeDOptions,
    occasions: ["family", "anniversary", "housewarming"],
    tags: ["3d family", "keepsake", "premium"],
    isFeatured: true,
    isBestseller: true,
    rating: 5.0,
    reviewCount: 31,
    icon: "magnet",
  },
  {
    name: "Personalized Keepsake Keychain",
    category: "future-keepsakes",
    tagline: "Carry your memory wherever you go",
    description: "Dual-sided acrylic & brass keychain featuring your photo on one side and a customized handwritten quote or date on the reverse.",
    price: 299,
    images: ["/images/pet-keepsake.webp"],
    isCustomizable: true,
    customizationPrompt: "Upload photo for side A and enter custom message for side B",
    occasions: ["birthday", "friendship", "just-because"],
    tags: ["keychain", "accessories", "portable keepsake"],
    isBestseller: true,
    rating: 4.6,
    reviewCount: 18,
    icon: "heart",
  },
  {
    name: "Cosy Evenings Gift Hamper",
    category: "gift-hampers",
    tagline: "Scented candles, cocoa & custom photo keepsake",
    description: "A luxury gift box featuring a hand-poured soy candle, artisanal hot chocolate, a plush throw blanket, and a complimentary custom photo magnet inside.",
    price: 1499,
    compareAtPrice: 1799,
    images: ["/images/luxury-ribbon-hamper.webp"],
    isCustomizable: true,
    customizationPrompt: "Upload photo for included custom magnet & write gift box note",
    occasions: ["housewarming", "thank-you", "birthday", "friendship"],
    tags: ["gift hamper", "self-care", "cosy"],
    isBestseller: true,
    rating: 4.9,
    reviewCount: 24,
    icon: "gift",
  },
  {
    name: "Celebration Sweets & Keepsake Box",
    category: "gift-hampers",
    tagline: "Handcrafted chocolates & personalized 3D keepsake",
    description: "Festive hamper containing gourmet chocolates, roasted dry fruits, a sparkling beverage, and a personalized 3D pet or couple keepsake card.",
    price: 1899,
    compareAtPrice: 2199,
    images: ["/images/luxury-ribbon-hamper.webp"],
    isCustomizable: true,
    customizationPrompt: "Upload photo for custom 3D keepsake and specify gift note text",
    occasions: ["congratulations", "birthday", "wedding", "anniversary"],
    tags: ["gift hamper", "celebration", "chocolates"],
    isBestseller: true,
    rating: 5.0,
    reviewCount: 41,
    icon: "gift",
  },
];

const initialCoupons = [
  {
    code: "RIBBON100",
    description: "Flat ₹100 OFF on orders above ₹499",
    discountType: "fixed",
    discountAmount: 100,
    minOrderAmount: 499,
    usageLimit: 5000,
    isActive: true,
  },
  {
    code: "LOVE15",
    description: "15% OFF for Anniversaries & Couples Gifts",
    discountType: "percentage",
    discountAmount: 15,
    minOrderAmount: 699,
    maxDiscount: 250,
    usageLimit: 2000,
    isActive: true,
  },
  {
    code: "FREESHIP",
    description: "Free Express Delivery on any order",
    discountType: "fixed",
    discountAmount: 79,
    minOrderAmount: 0,
    usageLimit: 5000,
    isActive: true,
  },
];

export const seedData = async ({ force = false } = {}) => {
  // 1. Seed Admin & Demo Customer User
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@theribbonstory.com").toLowerCase();
  let adminUser = await User.findOne({ email: adminEmail });
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const canCreateAdmin =
    (configuredPassword && configuredPassword.length >= 12) || process.env.NODE_ENV !== "production";
  if (!adminUser && !canCreateAdmin) {
    console.warn(
      "[Seed] No admin account created: set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) to create one."
    );
  }
  if (!adminUser && canCreateAdmin) {
    // Never fall back to a well-known default password
    const adminPassword =
      configuredPassword && configuredPassword.length >= 12
        ? configuredPassword
        : crypto.randomBytes(12).toString("base64url");
    adminUser = await User.create({
      name: "Admin Manager",
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      addresses: [
        {
          label: "Studio Headquarters",
          line1: "Plot 42, Bandra West",
          line2: "Near Linking Road",
          city: "Mumbai",
          state: "Maharashtra",
          postalCode: "400050",
          phone: "9876543210",
        },
      ],
    });
    console.log(
      adminPassword === configuredPassword
        ? `Admin account created: ${adminEmail} (password from ADMIN_PASSWORD)`
        : `Development admin account created: ${adminEmail} (password: ${adminPassword})`
    );
  }

  // 2. Seed Categories
  const categoryCount = await Category.countDocuments();
  if (categoryCount === 0 || force) {
    if (force) await Category.deleteMany({});
    await Category.insertMany(initialCategories);
    console.log(`Seeded ${initialCategories.length} categories`);
  }

  // 3. Seed Products
  const productCount = await Product.countDocuments();
  let seededProductDocs = [];
  if (productCount === 0 || force) {
    if (force) await Product.deleteMany({});
    const categoryCounters = {};
    const docs = products.map((p) => {
      const i = categoryCounters[p.category] || 0;
      categoryCounters[p.category] = i + 1;
      return {
        ...p,
        slug: slugify(p.name),
        images: p.images && p.images.length > 0 ? p.images : [placeholderImage(p.name, i, { icon: p.icon, category: p.category })],
      };
    });
    seededProductDocs = await Product.insertMany(docs);
    console.log(`Seeded ${docs.length} products`);
  } else {
    seededProductDocs = await Product.find();
  }

  // 4. Seed Coupons
  const couponCount = await Coupon.countDocuments();
  if (couponCount === 0 || force) {
    if (force) await Coupon.deleteMany({});
    await Coupon.insertMany(initialCoupons);
    console.log(`Seeded ${initialCoupons.length} promotional coupons`);
  }

  // 5. Seed Product Reviews
  const reviewCount = await Review.countDocuments();
  if (reviewCount === 0 || force) {
    if (force) await Review.deleteMany({});
    if (seededProductDocs.length > 0 && adminUser) {
      const sampleReviews = [
        {
          product: seededProductDocs[0]._id,
          user: adminUser._id,
          userName: "Ananya Deshmukh",
          userCity: "Pune",
          rating: 5,
          title: "The acrylic gloss and finish is stunning!",
          comment: "Turned our Goa beach trip picture into this photo magnet. The colors are vibrant and scratch-proof. Everyone asking where I made it!",
          photos: ["/images/photo-magnet.webp"],
          isVerifiedPurchase: true,
          isApproved: true,
        },
        {
          product: seededProductDocs[2]._id,
          user: adminUser._id,
          userName: "Rohan & Meera",
          userCity: "Bengaluru",
          rating: 5,
          title: "Best 1st Anniversary Gift Ever",
          comment: "Ordered the 3D couple miniature. The likeness and hand-painted details on our clothes blew us away. Packaged in a beautiful satin ribbon gift box.",
          photos: ["/images/for-couples.webp"],
          isVerifiedPurchase: true,
          isApproved: true,
        },
        {
          product: seededProductDocs[3]._id,
          user: adminUser._id,
          userName: "Dr. Siddharth Verma",
          userCity: "Delhi NCR",
          rating: 5,
          title: "Captured our Golden Retriever perfectly!",
          comment: "Our dog Bruno passed away recently and this 3D sculpt brought tears to our eyes. Thank you for such loving craftsmanship.",
          photos: ["/images/3d-dog-keepsake.webp"],
          isVerifiedPurchase: true,
          isApproved: true,
        },
      ];
      await Review.insertMany(sampleReviews);
      console.log(`Seeded initial customer reviews`);
    }
  }

  return { seeded: true, count: seededProductDocs.length };
};

export const seedProducts = seedData;

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  dotenv.config();
  const { connectDB } = await import("../config/db.js");
  await connectDB();
  const result = await seedData({ force: true });
  console.log(`Seeding complete: ${result.count} products.`);
  await mongoose.disconnect();
  process.exit(0);
}
