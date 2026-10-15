import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
dotenv.config();

const run = async () => {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/theribbonstory";

  console.log(`Connecting to MongoDB: ${uri}...`);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }

  try {
    // 1. Find or create customer user
    let user = await User.findOne({ role: "customer" });
    if (!user) {
      user = await User.findOne();
    }
    if (!user) {
      user = await User.create({
        name: "Rahul Sharma",
        email: "rahul.sharma@example.com",
        password: "CustomerPassword123!",
        role: "customer",
        phone: "+91 98765 43210",
      });
      console.log(`Created test customer: ${user.email}`);
    } else {
      console.log(`Using existing user: ${user.name} (${user.email})`);
    }

    // 2. Find or create keepsake / personalized product
    let product = await Product.findOne({
      $or: [
        { slug: "custom-3d-keepsake-figurine" },
        { category: "personalized-3d" },
        { category: "3d-keepsakes" },
      ],
    });

    if (!product) {
      product = await Product.findOne();
    }

    if (!product) {
      product = await Product.create({
        name: "Custom 3D Keepsake Figurine",
        slug: "custom-3d-keepsake-figurine",
        description: "Turn your favorite photograph into a handcrafted 3D chibi figurine.",
        price: 2199,
        compareAtPrice: 3499,
        category: "personalized-3d",
        images: ["/images/3d-couple-keepsake.webp"],
        inStock: true,
        stock: 50,
      });
      console.log("Created custom keepsake product record.");
    } else {
      console.log(`Using product: ${product.name} (ID: ${product._id})`);
    }

    // 3. Create paid order
    const orderNumber = `TRS-TEST-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date();

    const newOrder = await Order.create({
      user: user._id,
      items: [
        {
          product: product._id,
          name: "Custom 3D Couple Keepsake Figurine",
          image: "/images/3d-couple-keepsake.webp",
          price: 2199,
          quantity: 1,
          selectedOptions: [
            { name: "Subject", value: "Couple", priceDelta: 0 },
            { name: "Dimensions", value: '6.5" (16.5 cm)', priceDelta: 0 },
            { name: "Tier", value: "Signature Couple", priceDelta: 0 },
          ],
          customization: {
            category: "couple",
            size: '6.5" (16.5 cm)',
            dimensions: '6.5" (16.5 cm)',
            customName: "Rahul & Priya",
            customDate: "14 Feb 2026",
            photoUrl: "/images/3d-couple-keepsake.webp",
            note: "Laser engrave 'Rahul & Priya - Forever & Always ❤️' on the polished walnut wood base.",
            productionStatus: "pending_design",
            productionNotes: "Test order: Customer pre-approved concept render.",
          },
        },
      ],
      shippingAddress: {
        name: "Rahul Sharma",
        line1: "Flat 402, Sunshine Heights, 12th Main Road, Indiranagar",
        line2: "Near Metro Station",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560038",
        country: "India",
        phone: "+91 98765 43210",
      },
      itemsPrice: 2199,
      shippingPrice: 0,
      discountPrice: 0,
      totalPrice: 2199,
      paymentMethod: "razorpay",
      paymentResult: {
        razorpayOrderId: `order_${orderNumber}`,
        razorpayPaymentId: `pay_test_${Date.now()}`,
        razorpaySignature: "mock_signature_verified_success",
      },
      isPaid: true,
      paidAt: now,
      status: "confirmed",
      courierPartner: "BlueDart Express (Shiprocket)",
      trackingNumber: `BD${Date.now().toString().slice(-8)}IN`,
      estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
    });

    console.log("==================================================");
    console.log("TEST ORDER CREATED SUCCESSFULLY!");
    console.log(`Order ID:        ${newOrder._id}`);
    console.log(`Payment Status:  PAID (Razorpay Verified)`);
    console.log(`Order Status:    ${newOrder.status.toUpperCase()}`);
    console.log(`Customer:        ${newOrder.shippingAddress.name} (${user.email})`);
    console.log(`Total Paid:      ₹${newOrder.totalPrice.toLocaleString("en-IN")}`);
    console.log(`Keepsake Item:   ${newOrder.items[0].name}`);
    console.log(`Engraved Text:   "${newOrder.items[0].customization.note}"`);
    console.log("==================================================");
  } catch (err) {
    console.error("Error creating test order:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
