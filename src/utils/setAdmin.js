import readline from "readline";
import { pathToFileURL } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";

export const MIN_ADMIN_PASSWORD = 12;

/**
 * Create the admin account, or reset its password and make sure it is an
 * admin. Signs the account out everywhere (old sessions stop working).
 */
/** Normalised email, or an error explaining what's wrong with the details */
export const checkAdminDetails = ({ email, password }) => {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error("Please give a valid admin email address.");
  if (typeof password !== "string" || password.length < MIN_ADMIN_PASSWORD) {
    throw new Error(`The admin password must be at least ${MIN_ADMIN_PASSWORD} characters.`);
  }
  return cleanEmail;
};

export const setAdminAccount = async ({ email, password, name = "Admin Manager" }) => {
  const cleanEmail = checkAdminDetails({ email, password });

  const existing = await User.findOne({ email: cleanEmail });
  if (existing) {
    existing.password = password; // hashed, and tokenVersion bumped, on save
    existing.role = "admin";
    await existing.save();
    return { created: false, email: cleanEmail };
  }
  await User.create({ name, email: cleanEmail, password, role: "admin" });
  return { created: true, email: cleanEmail };
};

/** Read a password from the terminal without echoing it */
const askHidden = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  // npm run set-admin -- admin@theribbonstory.com
  // (password from ADMIN_PASSWORD, otherwise asked for without showing it)
  dotenv.config();
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;
  if (!password && process.stdin.isTTY) {
    password = await askHidden(`New password for ${email} (${MIN_ADMIN_PASSWORD}+ characters): `);
    const again = await askHidden("Type it again: ");
    if (password !== again) {
      console.error("The passwords don't match. Nothing was changed.");
      process.exit(1);
    }
  }
  try {
    checkAdminDetails({ email, password });
  } catch (err) {
    console.error(`${err.message} Nothing was changed.`);
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set, so there is no database to update. Run this on the server where the API runs.");
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const result = await setAdminAccount({ email, password });
    console.log(
      result.created
        ? `Admin account created for ${result.email}. Sign in at /admin/login.`
        : `Password reset and admin access confirmed for ${result.email}. Older sign-ins were signed out.`
    );
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(`Could not set the admin account: ${err.message}`);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}
