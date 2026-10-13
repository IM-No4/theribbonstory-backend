import path from "path";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { Client, handle_file } from "@gradio/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
const chibiOutputDir = path.join(uploadsDir, "chibi");

// Ensure permanent storage directory exists
if (!existsSync(chibiOutputDir)) {
  mkdirSync(chibiOutputDir, { recursive: true });
}

const SPACE = "hugging-apps/qwen-qwen-image-2-1-turbo";

let clientPromise;

export function getClient() {
  if (!clientPromise) {
    const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
    const options = token ? { hf_token: token } : {};
    clientPromise = Client.connect(SPACE, options).catch((err) => {
      clientPromise = undefined;
      throw err;
    });
  }
  return clientPromise;
}

export const DEFAULT_CHIBI_PROMPT = `
Transform the uploaded photo into a cute, high-quality **3D chibi figurine designed specifically for real-world FDM 3D printing**. Preserve each person's recognizable facial features, hairstyle, beard shape, skin tone, clothing style, and overall appearance in a clean, simplified aesthetic. If the photo shows a couple or multiple people, sculpt all individuals standing together in a coordinated, affectionate pose on a shared integrated display base. Use oversized heads, compact bodies, sturdy limbs, rounded proportions, and stable standing poses.

### Hair and beard
Sculpt all head hair, hairstyles, moustache, and beard as solid, continuous 3D masses firmly attached to the head and face. Use broad, smooth sculpted shapes without individual loose strands, thin grooves, sharp spikes, or floating pieces. The beard must be thick, connected, and solid.

### Clothing & Objects — Plain Solid Colors, Completely Pattern-Free & Simple
**Strict Requirement: All clothing, garments, and objects must be completely PLAIN, SMOOTH, and PATTERN-FREE.**
- **Remove All Patterns & Embroidery:** Strip away all fabric patterns, embroidery, prints, lace, peacock or animal motifs, floral designs, gridlines, checks, stripes, and decorative borders. All clothing surfaces must be completely patternless and smooth.
- **Solid Uniform Colors:** Each garment piece must have exactly ONE solid, uniform base color matching the primary color seen in the photo (e.g. solid red for the lehenga/kurta, solid white for trousers). Treat all garments as smooth, single-color molded plastic toy parts without gradients, color variations, or painted-on details.
- **Clean Minimalist Shapes:** Simplify outfits into broad, smooth 3D molded shapes. Do not include realistic cloth folds, fine wrinkles, decorative stitching, or delicate frills.
- **Outfit Style Match:** Faithfully preserve each individual's actual attire type as shown in the reference image (e.g. traditional kurta, sherwani, lehenga, saree, or western pants, shirt) in simplified solid-color form. Under no circumstances replace traditional outfits with western jackets, blazers, or suits.
- **Footwear & Accessories:** Keep footwear simple and solid-colored (matching the photo), firmly resting on the base. Simplify or omit delicate jewelry, watches, and complex micro-accessories so the figurine remains clean, uncluttered, and sturdy.

### FDM 3D-Printing & Geometry Requirements
1. Create a physically printable, watertight, manifold-style figurine design with solid, connected geometry. Use thick, sturdy features and rounded edges.
2. Avoid thin parts, fragile protrusions, deep narrow grooves, undercuts, unsupported overhangs, detached elements, and floating geometry that would break during FDM printing.
3. Keep the legs sturdy, the feet broad and flat, and the center of gravity balanced for stable standing.
4. Arms, hands, and garments must be securely integrated into the main body silhouette without fragile gaps.

### Base / Display Stand — Required
Include an integrated, solid display base beneath the figurine's feet. The base must be part of the final 3D model and must not be omitted.
- **Shape:** Choose a circular or oval base supporting all figures with a small margin around them, level and flat-bottomed for build plate adhesion.
- **Proportions:** Keep the base proportional to the figurine, with adequate thickness and rigidity for stable standing.
- **Design & Inscription:** Clean, smooth, single-color base with gently rounded outer edges. If custom engraving text or inscription is requested below, neatly sculpt, engrave, or emboss that exact text on the front vertical edge of the base platform; otherwise keep the surface completely smooth and free of patterns.
- **Attachment:** All feet must sit directly on and connect solidly to the base platform to ensure stability.

**Final requirement:** Always generate the complete full-body figurine standing on its own integrated display base, with clean, pattern-free, solid-color clothing and smooth surfaces accurately matching the subjects' faces, poses, and primary outfit colors.
`.trim();

/**
 * Downloads image bytes from Gradio URL and saves permanently to /uploads/chibi/
 */
async function saveGradioImageLocally(gradioUrl) {
  const res = await fetch(gradioUrl);
  if (!res.ok) {
    throw new Error(`Failed to download generated image from Gradio: ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const filename = `chibi-${Date.now()}-${Math.floor(Math.random() * 1e8)}.png`;
  const permanentPath = path.join(chibiOutputDir, filename);

  await fs.writeFile(permanentPath, buffer);

  return {
    url: `/uploads/chibi/${filename}`,
    filename,
    size: buffer.length,
    path: permanentPath,
  };
}

/**
 * Generates a 3D Chibi figurine image from a local file path
 */
export async function generateChibiFromLocalFile(localFilePath, customPrompt = null) {
  const client = await getClient();
  let prompt = DEFAULT_CHIBI_PROMPT;
  if (customPrompt && typeof customPrompt === "string" && customPrompt.trim()) {
    if (customPrompt.includes("Transform the uploaded photo")) {
      prompt = customPrompt.trim();
    } else {
      prompt = `${DEFAULT_CHIBI_PROMPT}\n\n### Customer Personalization & Custom Details:\n${customPrompt.trim()}`;
    }
  }

  const payload = {
    prompt,
    seed: Math.floor(Math.random() * 2147483647),
    resolution: 1024,
    aspect_ratio: "3:4",
  };

  console.log("\n==================== [CHIBI GENERATION REQUEST] ====================");
  console.log(`[Timestamp]:     ${new Date().toISOString()}`);
  console.log(`[Space Target]:  ${SPACE}`);
  console.log(`[Input Image]:   ${localFilePath}`);
  console.log(`[Seed]:          ${payload.seed}`);
  console.log(`[Resolution]:    ${payload.resolution}`);
  console.log(`[Aspect Ratio]:  ${payload.aspect_ratio}`);
  console.log(`[Prompt Length]: ${payload.prompt.length} characters`);
  console.log("-------------------- [PROMPT TEXT] --------------------");
  console.log(payload.prompt);
  console.log("====================================================================\n");

  const startTime = Date.now();
  let result;
  try {
    result = await client.predict("/generate", {
      prompt: payload.prompt,
      input_images: [{ image: handle_file(localFilePath) }],
      seed: payload.seed,
      resolution: payload.resolution,
      aspect_ratio: payload.aspect_ratio,
    });
  } catch (err) {
    console.error("\n==================== [CHIBI GENERATION ERROR] ====================");
    console.error(`[Failed After]:  ${Date.now() - startTime}ms`);
    console.error(`[Error]:`, err.message || err);
    console.error("==================================================================\n");
    throw err;
  }

  const durationMs = Date.now() - startTime;
  const outputItem = result?.data?.[0];
  const fileUrl = outputItem?.url;

  console.log("\n==================== [CHIBI GENERATION RESPONSE] ====================");
  console.log(`[Duration]:      ${durationMs}ms`);
  console.log(`[Generated URL]: ${fileUrl || "None"}`);
  console.log("====================================================================\n");

  if (!fileUrl) {
    throw new Error("No image output returned from Qwen Turbo Chibi generation");
  }

  return await saveGradioImageLocally(fileUrl);
}

/**
 * Generates a 3D Chibi figurine image from an existing photo URL
 * Supports local /uploads/ URLs or external URLs
 */
export async function generateChibiFromUrl(photoUrl, customPrompt = null) {
  if (!photoUrl) {
    throw new Error("Photo URL is required");
  }

  // If it's a local /uploads/ URL, resolve it directly on disk
  if (photoUrl.startsWith("/uploads/") || photoUrl.startsWith("uploads/")) {
    const relativePath = photoUrl.replace(/^\/?uploads\//, "");
    const localDiskPath = path.join(uploadsDir, relativePath);

    try {
      await fs.access(localDiskPath);
      return await generateChibiFromLocalFile(localDiskPath, customPrompt);
    } catch {
      // If local file not found directly, fallback to HTTP fetch
    }
  }

  // Handle external or full URLs
  let resolvedUrl = photoUrl;
  if (photoUrl.startsWith("/")) {
    resolvedUrl = `http://localhost:${process.env.PORT || 5050}${photoUrl}`;
  }

  const tmpPath = path.join(os.tmpdir(), `chibi-input-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`);

  try {
    const res = await fetch(resolvedUrl);
    if (!res.ok) {
      throw new Error(`Could not fetch photo from ${resolvedUrl}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(tmpPath, buf);

    return await generateChibiFromLocalFile(tmpPath, customPrompt);
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}
