import app from "./app.js";
import { connectDB } from "./config/db.js";
import { scheduleCleanup } from "./services/previewCleanup.js";
import { scheduleShipmentSync } from "./services/shipmentSync.js";

const PORT = process.env.PORT || 5050;

const start = async () => {
  await connectDB();
  scheduleCleanup();
  scheduleShipmentSync();
  app.listen(PORT, '127.0.0.1', () => console.log(`The Ribbon Story API running on http://localhost:${PORT}`));
};

start();
