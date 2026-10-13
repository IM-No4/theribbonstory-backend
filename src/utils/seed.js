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
    name: "Articulated & Flexi",
    slug: "articulated",
    description: "Multi-jointed movable 3D creatures, articulated dragons, and fidget sensory models",
    image: "/images/3d-dog-keepsake.webp",
    badge: "Trending",
    order: 1,
    isFeatured: true,
  },
  {
    name: "Animals & Wildlife",
    slug: "animals",
    description: "Low-poly geometric wildlife and lifelike desk pet figurines",
    image: "/images/pet-keepsake.webp",
    badge: "Popular",
    order: 2,
    isFeatured: true,
  },
  {
    name: "Pots, Planters & Vases",
    slug: "pots-planters",
    description: "Modern geometric succulent pots, self-watering planters, and spiral vases",
    image: "/images/gifts-for-housewarming.webp",
    badge: "Home Decor",
    order: 3,
    isFeatured: true,
  },
  {
    name: "Candle Holders & Lights",
    slug: "candle-holders",
    description: "Lotus tea light holders, lithophane lamps, and shadow-casting lanterns",
    image: "/images/anniversary.webp",
    badge: "Ambient",
    order: 4,
    isFeatured: true,
  },
  {
    name: "Festival & Cultural",
    slug: "festival",
    description: "Diwali diyas, modern sacred idols, and festive holiday decorations",
    image: "/images/gifts-for-parents.webp",
    badge: "Festive",
    order: 5,
    isFeatured: true,
  },
  {
    name: "Desk & Gadgets",
    slug: "desk-accessories",
    description: "Headphone stands, ergonomic phone docks, and desktop cable organizers",
    image: "/images/gifts-for-him.webp",
    badge: "Functional",
    order: 6,
    isFeatured: true,
  },
  {
    name: "Personalized 3D Keepsakes",
    slug: "personalized-3d",
    description: "Bespoke full-color 3D chibi figurines sculpted from customer photos",
    image: "/images/3d-couple-keepsake.webp",
    badge: "Bespoke",
    order: 7,
    isFeatured: true,
  },
];

const filamentColorOptions = [
  {
    name: "Filament Finish",
    values: [
      { label: "Silk Dual-Tone (Iridescent)", priceDelta: 0 },
      { label: "Matte Velvet (Solid)", priceDelta: 0 },
      { label: "Marble Stone Texture", priceDelta: 50 },
      { label: "Glow-in-the-Dark Phosphor", priceDelta: 80 },
    ],
  },
  {
    name: "Size",
    values: [
      { label: "Standard Desktop (15–18 cm)", priceDelta: 0 },
      { label: "Large Statement (22–25 cm)", priceDelta: 200 },
    ],
  },
];

const planterOptions = [
  {
    name: "Planter Size",
    values: [
      { label: 'Mini 3.5" (Succulent & Cacti)', priceDelta: 0 },
      { label: 'Medium 5.0" (Indoor Plants)', priceDelta: 150 },
      { label: 'Large 6.5" (Tabletop Statement)', priceDelta: 300 },
    ],
  },
  {
    name: "Drainage Feature",
    values: [
      { label: "With Matching Base Tray", priceDelta: 0 },
      { label: "Self-Watering Reservoir Insert", priceDelta: 79 },
    ],
  },
];

const keepsakeCustomOptions = [
  {
    name: "Display Size",
    values: [
      { label: 'Small 3.5" (9 cm Desk)', priceDelta: 0 },
      { label: 'Classic Studio 5.5" (14 cm)', priceDelta: 600 },
      { label: 'Grand Deluxe 8.0" (20 cm)', priceDelta: 1500 },
    ],
  },
];

const products = [
  {
    name: "Articulated Crystal Dragon",
    category: "articulated",
    tagline: "Fluid multi-jointed flexi dragon with crystal ridges",
    description: "Meticulously engineered print-in-place flexi dragon featuring dozens of smooth ball joints. Printed in ultra-smooth silk dual-tone filament that shifts color as it twists and turns.",
    price: 799,
    compareAtPrice: 999,
    images: ["/images/3d-dog-keepsake.webp"],
    isCustomizable: false,
    optionGroups: filamentColorOptions,
    occasions: ["birthday", "just-because", "friendship"],
    tags: ["articulated", "dragon", "flexi", "fidget", "bestseller"],
    isFeatured: true,
    isBestseller: true,
    rating: 5.0,
    reviewCount: 42,
    icon: "sparkles",
  },
  {
    name: "Flexi Gecko & Chameleon",
    category: "articulated",
    tagline: "Realistic tactile fidget reptile with textured scales",
    description: "Adorable tactile desk companion with independently moving spine, limbs, and tail. Perfect for stress relief, desk decor, or gifting to wildlife enthusiasts.",
    price: 499,
    compareAtPrice: 649,
    images: ["/images/pet-keepsake.webp"],
    isCustomizable: false,
    optionGroups: filamentColorOptions,
    occasions: ["birthday", "just-because"],
    tags: ["articulated", "gecko", "reptile", "fidget"],
    isFeatured: true,
    isBestseller: true,
    rating: 4.9,
    reviewCount: 31,
    icon: "sparkles",
  },
  {
    name: "Low-Poly Geometric Lion",
    category: "animals",
    tagline: "Modern faceted wildlife sculpture in matte finish",
    description: "A striking minimalist lion statuette designed with clean low-poly facets. Precision sliced for crisp geometric edges that cast bold shadows on modern desks and bookshelves.",
    price: 649,
    compareAtPrice: 799,
    images: ["/images/gifts-for-him.webp"],
    isCustomizable: false,
    optionGroups: filamentColorOptions,
    occasions: ["housewarming", "birthday", "just-because"],
    tags: ["animal", "lion", "geometric", "low-poly", "decor"],
    isFeatured: true,
    isBestseller: true,
    rating: 4.8,
    reviewCount: 26,
    icon: "star",
  },
  {
    name: "Playful Golden Retriever Desk Statuette",
    category: "animals",
    tagline: "Charming stylized dog figurine with smooth contours",
    description: "Captures the joy and warmth of man's best friend in durable, non-toxic bio-PLA. Designed with a solid weighted base for stability.",
    price: 549,
    compareAtPrice: 699,
    images: ["/images/3d-dog-keepsake.webp"],
    isCustomizable: false,
    optionGroups: filamentColorOptions,
    occasions: ["pets", "birthday", "just-because"],
    tags: ["animal", "dog", "retriever", "desk pet"],
    isFeatured: true,
    isBestseller: true,
    rating: 4.9,
    reviewCount: 38,
    icon: "heart",
  },
  {
    name: "Geometric Faceted Succulent Planter",
    category: "pots-planters",
    tagline: "Modern hexagonal planter with matching drainage tray",
    description: "Clean architectural lines make this planter a statement centerpiece for succulents, cacti, or snake plants. 100% watertight walls with optimized bottom aeration.",
    price: 449,
    compareAtPrice: 599,
    images: ["/images/gifts-for-housewarming.webp"],
    isCustomizable: false,
    optionGroups: planterOptions,
    occasions: ["housewarming", "birthday", "just-because"],
    tags: ["planter", "pot", "succulent", "geometric"],
    isFeatured: true,
    isBestseller: true,
    rating: 4.9,
    reviewCount: 47,
    icon: "box",
  },
  {
    name: "Vortex Spiral Twisted Vase",
    category: "pots-planters",
    tagline: "Dramatic spiral curvature with silk satin shimmer",
    description: "An optical marvel printed with continuous organic spiral geometry. Shimmers elegantly under indoor lighting, perfect for dried florals and pampas grass.",
    price: 699,
    compareAtPrice: 899,
    images: ["/images/gifts-for-her.webp"],
    isCustomizable: false,
    optionGroups: filamentColorOptions,
    occasions: ["anniversary", "housewarming", "wedding"],
    tags: ["vase", "spiral", "twisted", "decor"],
    isFeatured: true,
    isBestseller: true,
    rating: 5.0,
    reviewCount: 34,
    icon: "star",
  },
  {
    name: "Lotus Petal Tea Light Pedestal",
    category: "candle-holders",
    tagline: "Tiered blooming lotus petals for tea light candles",
    description: "Multi-tiered lotus flower design engineered to hold standard wax and LED tea light candles. Heat-shielded base prevents thermal transfer to furniture.",
    price: 399,
    compareAtPrice: 499,
    images: ["/images/anniversary.webp"],
    isCustomizable: false,
    optionGroups: filamentColorOptions,
    occasions: ["diwali", "anniversary", "housewarming"],
    tags: ["candle holder", "lotus", "tealight", "ambient"],
    isFeatured: true,
    isBestseller: true,
    rating: 4.9,
    reviewCount: 29,
    icon: "heart",
  },
  {
    name: "Architectural Shadow Glow Lantern",
    category: "candle-holders",
    tagline: "Voronoi lattice that casts mesmerizing ambient shadows",
    description: "Organic cellular lattice patterns cast intricate geometric shadow projections across walls and tables. Suitable for battery-powered tea lights and scented candles.",
    price: 549,
    compareAtPrice: 699,
    images: ["/images/same-day-delivery.webp"],
    isCustomizable: false,
    optionGroups: filamentColorOptions,
    occasions: ["housewarming", "anniversary", "just-because"],
    tags: ["candle holder", "shadow lantern", "voronoi", "glow"],
    isFeatured: true,
    isBestseller: false,
    rating: 4.8,
    reviewCount: 19,
    icon: "star",
  },
  {
    name: "Diwali Diya & Rangoli Tealight Set",
    category: "festival",
    tagline: "Festive modular rangoli tealight holders with golden accents",
    description: "Celebrate Indian festivals with modern 3D printed diyas. Reusable year after year, easy to clean, and designed for safe LED and oil tealight illumination.",
    price: 499,
    compareAtPrice: 649,
    images: ["/images/gifts-for-parents.webp"],
    isCustomizable: false,
    optionGroups: filamentColorOptions,
    occasions: ["diwali", "puja", "festival", "family"],
    tags: ["festival", "diwali", "diya", "rangoli", "festive"],
    isFeatured: true,
    isBestseller: true,
    rating: 5.0,
    reviewCount: 53,
    icon: "sparkles",
  },
  {
    name: "Modern Low-Poly Ganesha Figurine",
    category: "festival",
    tagline: "Sacred contemporary idol sculpted in geometric facets",
    description: "An auspicious centerpiece combining timeless spirituality with contemporary minimalist polygon design. Ideal for mandir, car dashboard, or office study.",
    price: 699,
    compareAtPrice: 849,
    images: ["/images/gifts-for-couples.webp"],
    isCustomizable: false,
    optionGroups: filamentColorOptions,
    occasions: ["ganesh-chaturthi", "diwali", "housewarming", "new-job"],
    tags: ["festival", "ganesha", "idol", "spiritual", "geometric"],
    isFeatured: true,
    isBestseller: true,
    rating: 5.0,
    reviewCount: 44,
    icon: "heart",
  },
  {
    name: "Dual Headphone & Phone Desk Stand",
    category: "desk-accessories",
    tagline: "Sturdy weighted headphone perch and phone viewing dock",
    description: "Keep your workspace clean and organized. Holds over-ear studio headphones securely while keeping your smartphone visible for notifications or video calls.",
    price: 749,
    compareAtPrice: 899,
    images: ["/images/gifts-for-him.webp"],
    isCustomizable: false,
    optionGroups: filamentColorOptions,
    occasions: ["birthday", "work-anniversary", "just-because"],
    tags: ["desk", "headphone stand", "tech", "organizer"],
    isFeatured: true,
    isBestseller: true,
    rating: 4.9,
    reviewCount: 37,
    icon: "box",
  },
  {
    name: "Hexagonal Modular Desk Caddy",
    category: "desk-accessories",
    tagline: "Magnetic honeycomb pen, stylus, and gadget organizer",
    description: "Multi-tiered honeycomb compartments hold pens, rulers, scissors, USB drives, and small desk accessories. Clean geometric aesthetic that declutters any workspace.",
    price: 449,
    compareAtPrice: 599,
    images: ["/images/gifts-for-friends.webp"],
    isCustomizable: false,
    optionGroups: filamentColorOptions,
    occasions: ["student", "work", "birthday"],
    tags: ["desk", "caddy", "organizer", "pens"],
    isFeatured: true,
    isBestseller: false,
    rating: 4.7,
    reviewCount: 22,
    icon: "box",
  },
  {
    name: "Custom 3D Keepsake Figurine",
    category: "personalized-3d",
    tagline: "Turn your favorite photograph into a cute 3D printed keepsake",
    description: "Upload any portrait photo of yourself, a couple, or beloved pet. Our 3D studio will model a cute stylized chibi figurine, engrave your custom inscription on the base, and print it with Bambu Lab FDM precision.",
    price: 1299,
    compareAtPrice: 2199,
    images: ["/images/3d-couple-keepsake.webp"],
    isCustomizable: true,
    customizationPrompt: "Upload your photo and specify optional engraved base text or artisan notes",
    optionGroups: keepsakeCustomOptions,
    occasions: ["anniversary", "birthday", "wedding", "couples", "pets"],
    tags: ["personalized", "3d keepsake", "photo to 3d", "chibi", "bestseller"],
    isFeatured: true,
    isBestseller: true,
    rating: 5.0,
    reviewCount: 68,
    icon: "sparkles",
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
  if (adminUser && configuredPassword && configuredPassword.length >= 12) {
    adminUser.password = configuredPassword;
    adminUser.role = "admin";
    await adminUser.save();
    console.log(`Admin account password updated from ADMIN_PASSWORD for: ${adminEmail}`);
  } else if (!adminUser && canCreateAdmin) {
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

  // 2. Seed Categories (ensure 3D categories are active)
  const existingCat = await Category.findOne({ slug: "articulated" });
  const shouldRecreateCategories = !existingCat || force;
  if (shouldRecreateCategories) {
    await Category.deleteMany({});
    await Category.insertMany(initialCategories);
    console.log(`Seeded ${initialCategories.length} 3D categories`);
  }

  // 3. Seed Products (ensure 3D catalog is active)
  const existing3DProduct = await Product.findOne({ category: "articulated" });
  let seededProductDocs = [];
  if (!existing3DProduct || force) {
    await Product.deleteMany({});
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
