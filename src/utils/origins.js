/**
 * Browser origins allowed to call the API with credentials (CORS) and to
 * make cookie-authenticated state-changing requests (CSRF check).
 * Read lazily so values from .env are picked up after dotenv loads.
 */
export const getAllowedOrigins = () =>
  (process.env.CLIENT_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .concat([
      "https://theribbonstory.com",
      "https://www.theribbonstory.com",
      "https://backend.theribbonstory.com",
    ])
    .concat(
      process.env.NODE_ENV === "production"
        ? []
        : [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5178",
            "http://127.0.0.1:5178",
            "http://localhost:3000",
          ]
    );

export const isAllowedOrigin = (origin) => getAllowedOrigins().includes(origin);
