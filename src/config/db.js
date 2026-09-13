import mongoose from "mongoose";

export const connectDB = async () => {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/theribbonstory";

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return;
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      console.error("MongoDB connection failed:", err.message);
      process.exit(1);
    }
  }

  console.warn("No reachable MongoDB found — starting an in-memory MongoDB for local development.");
  console.warn("Data will NOT persist between server restarts. Set MONGO_URI in backend/.env (e.g. MongoDB Atlas) for real persistence.");

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  console.log(`In-memory MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  process.on("SIGINT", async () => {
    await mongoose.disconnect();
    await mem.stop();
    process.exit(0);
  });
};
