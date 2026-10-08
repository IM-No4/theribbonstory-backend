import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";

import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { getJwtSecret } from "./utils/security.js";
import { isAllowedOrigin } from "./utils/origins.js";

import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import shippingRoutes from "./routes/shippingRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import reference3dRoutes from "./routes/reference3dRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import subscriberRoutes from "./routes/subscriberRoutes.js";
import seoRoutes from "./routes/seoRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config(); // fallback

// Fail fast on missing secrets in production
getJwtSecret();

const app = express();
// Behind the Nginx reverse proxy: use X-Forwarded-For for client IPs (rate limiting)
app.set("trust proxy", 1);

// 1. HTTP Security Headers with cross-origin asset support
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

// 2. High-Speed Gzip/Brotli Payload Compression
app.use(compression());

// 3. Rate Limiting Protection (DDoS / Brute-force protection)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // max 600 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests from this IP. Please try again after 15 minutes." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // max 30 login/register attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Please try again after 15 minutes." },
});

// 4. CORS configuration with multi-origin and credentials support
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin || isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// 5. Body Parsing with payload limits
app.use(
  express.json({
    limit: "10mb",
    // Razorpay signs the exact bytes it sends; keep them for the webhook
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith("/api/payments/razorpay/webhook")) req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 6. NoSQL Injection Sanitization Middleware
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (obj && typeof obj === "object") {
      for (const key of Object.keys(obj)) {
        if (key.startsWith("$") || key.includes(".")) {
          delete obj[key];
        } else if (typeof obj[key] === "object") {
          sanitize(obj[key]);
        }
      }
    }
  };
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);
  next();
});

// 7. Static Uploads directory with caching headers
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "uploads"), {
    maxAge: "7d",
    etag: true,
  })
);

// 8. Health Check
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", service: "theribbonstory-api", timestamp: new Date() })
);

// Sitemap and product share pages (outside /api: crawlers fetch these)
app.use(seoRoutes);

// 9. API Routes with rate limiters
app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/3d-agent", reference3dRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/subscribers", subscriberRoutes);
app.use("/api/waitlist", subscriberRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
