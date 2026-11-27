import express from "express";
import rateLimit from "express-rate-limit";
import { ingestEvents } from "../services/analyticsIngest.js";

const router = express.Router();

// Separate from the main API limit so tracking never uses up a shopper's requests.
// Generous because many phones share one mobile-network address.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 2000, standardHeaders: false, legacyHeaders: false });

// Sent as text/plain so browsers don't need a preflight request
router.post("/collect", limiter, express.text({ type: "text/plain", limit: "32kb" }), async (req, res) => {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    await ingestEvents(body, req.get("user-agent"));
  } catch (err) {
    console.warn("[analytics] Dropped a batch:", err.message);
  }
  // Tracking must never surface errors to the storefront
  res.status(204).end();
});

export default router;
