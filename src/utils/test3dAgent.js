import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { connectDB } from "../config/db.js";
import { runReferenceGenerationPipeline } from "../services/gemini3dAgent.js";
import Reference3D from "../models/Reference3D.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

async function runTest() {
  console.log("=== RIBBON STORY 3D REFERENCE AGENT E2E TEST ===");
  await connectDB();

  // Create temporary sample customer photo
  const testDir = path.join(__dirname, "test_assets");
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  
  const testPhotoPath = path.join(testDir, "test_customer_photo.jpg");
  fs.writeFileSync(testPhotoPath, "TEST_PHOTO_CONTENT_BUFFER_BINARY");

  console.log("→ Launching 4-View Reference Generation Pipeline...");
  const session = await runReferenceGenerationPipeline({
    uploadedFile: { path: testPhotoPath, originalname: "sample_memory.jpg" },
    customNotes: "Customer drinking coffee with dog on lap, preserve coffee mug and dog",
  });

  console.log("\n✓ Pipeline Execution Succeeded!");
  console.log(`- Session ID: ${session.sessionId}`);
  console.log(`- Storage Key: ${session.storageKey}`);
  console.log(`- Folder Path: ${session.folderPath}`);
  console.log(`- Status: ${session.status}`);
  console.log(`- Readiness Score: ${session.readinessScore?.overall}% (Silhouette: ${session.readinessScore?.silhouetteClarity}%)`);
  
  // Verify files on disk
  const filesToCheck = [
    "original.jpg",
    "front.png",
    "left.png",
    "right.png",
    "back.png",
    "manifest.json",
  ];

  console.log("\nVerifying Generated Server Files in Dedicated Folder:");
  for (const f of filesToCheck) {
    const fPath = path.join(session.folderPath, f);
    const exists = fs.existsSync(fPath);
    const size = exists ? fs.statSync(fPath).size : 0;
    console.log(`  ${exists ? "✓" : "✗"} ${f.padEnd(16)} [${size} bytes] -> ${fPath}`);
    if (!exists) throw new Error(`Missing generated file: ${f}`);
  }

  const zipExists = fs.existsSync(session.zipPackagePath);
  console.log(`  ${zipExists ? "✓" : "✗"} 3D Zip Package: ${session.zipPackagePath} (${fs.statSync(session.zipPackagePath).size} bytes)`);

  // Verify separate folder storage
  const customerPhotoCopy = path.join(__dirname, "..", "..", "uploads", "customer_photos", `${session.storageKey}_original.jpg`);
  console.log(`  ${fs.existsSync(customerPhotoCopy) ? "✓" : "✗"} Separate Customer Photos Dir: ${customerPhotoCopy}`);

  console.log("\n=== ALL 3D REFERENCE AGENT TESTS PASSED SUCCESSFULLY ===");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
