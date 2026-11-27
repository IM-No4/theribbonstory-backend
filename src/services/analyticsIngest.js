import AnalyticsEvent, { EVENT_TYPES } from "../models/AnalyticsEvent.js";
import Order from "../models/Order.js";
import { isObjectId } from "../utils/security.js";

const MAX_EVENTS = 25;
const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const BOT_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|node-fetch/i;

export const isBot = (userAgent) => !userAgent || BOT_PATTERN.test(userAgent);

export const deviceType = (userAgent = "") => {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(userAgent)) return "tablet";
  return /mobile|iphone|ipod|android/i.test(userAgent) ? "mobile" : "desktop";
};

// Strip anything that looks like personal data from free text
const text = (value, max) =>
  typeof value === "string"
    ? value
        .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
        .replace(/\+?\d[\d\s-]{7,}\d/g, "[number]")
        .trim()
        .slice(0, max)
    : "";

const tag = (value, max = 80) => text(value, max).toLowerCase();

const number = (value, max) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined;
};

// Order IDs and reset tokens must never end up in page paths
export const cleanPath = (value) => {
  const path = typeof value === "string" ? value.split(/[?#]/)[0] : "";
  if (!path.startsWith("/")) return "";
  return path
    .replace(/^\/(reset-password|set-password|order-success)\/.+$/i, "/$1/:id")
    .replace(/\/[a-f0-9]{24}(?=\/|$)/gi, "/:id")
    .slice(0, 200);
};

/** Validate a batch sent by the storefront and store it. Returns how many were kept. */
export const ingestEvents = async (body, userAgent) => {
  if (isBot(userAgent) || !body || typeof body !== "object") return 0;
  const { visitorId, sessionId, events } = body;
  if (!ID_PATTERN.test(visitorId || "") || !ID_PATTERN.test(sessionId || "") || !Array.isArray(events)) return 0;

  const visit = {
    visitorId,
    sessionId,
    source: tag(body.source) || "direct",
    medium: tag(body.medium) || "none",
    campaign: tag(body.campaign),
    device: deviceType(userAgent),
  };

  const docs = [];
  let purchases = 0;
  for (const event of events.slice(0, MAX_EVENTS)) {
    if (!EVENT_TYPES.includes(event?.type)) continue;

    if (event.type === "purchase") {
      // The amount always comes from the order itself, never from the browser
      if (!isObjectId(String(event.orderId))) continue;
      const order = await Order.findById(event.orderId).select("totalPrice");
      if (!order) continue;
      await AnalyticsEvent.updateOne(
        { type: "purchase", orderId: String(event.orderId) },
        {
          $setOnInsert: {
            ...visit,
            path: cleanPath(event.path),
            value: order.totalPrice,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
      purchases += 1;
      continue;
    }

    docs.push({
      ...visit,
      type: event.type,
      path: cleanPath(event.path),
      label: text(event.label, 80) || undefined,
      productId: text(event.productId, 64) || undefined,
      productName: text(event.productName, 160) || undefined,
      quantity: number(event.quantity, 1000),
      value: number(event.value, 10000000),
      createdAt: new Date(),
    });
  }

  if (docs.length) await AnalyticsEvent.insertMany(docs, { ordered: false });
  return docs.length + purchases;
};
