import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
dotenv.config(); // fallback to cwd .env

const targetEmail = (process.argv[2] || process.env.ADMIN_EMAIL || "admin@theribbonstory.com").toLowerCase().trim();
const targetPassword = process.argv[3] || process.env.ADMIN_PASSWORD || "D3UYxrzeLPypQsO0";

const run = async () => {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/theribbonstory";

  console.log(`Connecting to MongoDB: ${uri}...`);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err.message);
    console.error("Please ensure MongoDB is running locally or set a valid MONGO_URI in backend/.env.");
    process.exit(1);
  }

  try {
    let user = await User.findOne({ email: targetEmail });

    if (!user) {
      console.log(`User ${targetEmail} not found. Creating a new admin user...`);
      user = new User({
        name: "Admin Manager",
        email: targetEmail,
        password: targetPassword,
        role: "admin",
        addresses: [
          {
            label: "Studio Headquarters",
            line1: "Plot 42, Bandra West",
            city: "Mumbai",
            state: "Maharashtra",
            postalCode: "400050",
            country: "India",
            phone: "9876543210",
          },
        ],
      });
    } else {
      console.log(`User ${targetEmail} found. Updating password and ensuring role is 'admin'...`);
      user.password = targetPassword;
      user.role = "admin";
    }

    await user.save();
    console.log("--------------------------------------------------");
    console.log("SUCCESS: Admin credentials updated successfully!");
    console.log(`Email:    ${targetEmail}`);
    console.log(`Password: ${targetPassword}`);
    console.log(`Role:     ${user.role}`);
    console.log("--------------------------------------------------");
  } catch (err) {
    console.error("Error setting admin password:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
