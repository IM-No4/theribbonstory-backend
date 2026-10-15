import app from "./app.js";
import { connectDB } from "./config/db.js";
import { scheduleCleanup } from "./services/previewCleanup.js";

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  scheduleCleanup();
  app.listen(PORT, () => console.log(`The Ribbon Story API running on http://localhost:${PORT}`));
};

start();
