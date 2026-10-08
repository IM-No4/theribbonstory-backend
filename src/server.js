import app from "./app.js";
import { connectDB } from "./config/db.js";
import { seedProducts } from "./utils/seed.js";

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  const { seeded, count } = await seedProducts();
  if (seeded) console.log(`Auto-seeded ${count} sample products (database was empty)`);
  app.listen(PORT, () => console.log(`The Ribbon Story API running on http://localhost:${PORT}`));
};

start();
