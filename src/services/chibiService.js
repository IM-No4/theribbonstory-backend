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

### Color accuracy — Critical
Matching the exact colors from the photo is extremely important. Pay very close attention to the precise hue, shade, and tone of each garment and accessory:
- If a dress is **pink**, it must remain pink in the figurine — do not shift it to red, coral, or orange.
- If a garment is **pastel or light-colored**, keep it pastel and light — do not darken or saturate the color.
- If a sherwani or kurta is **off-white or cream**, keep it off-white — do not make it pure white or grey.
- Match the dupatta/scarf color to the exact shade visible in the photo.
- Every garment piece must faithfully reproduce the specific color seen in the reference image.

### Clothing — Simplified solid colors, no patterns
All clothing, garments, and objects must use only smooth, solid colors with no patterns whatsoever.
- Remove all fabric patterns, embroidery, prints, lace, motifs, floral designs, gridlines, checks, stripes, and decorative borders. All clothing surfaces must be completely smooth.
- Each garment piece must have exactly one solid color that precisely matches the color seen in the photo. Treat all garments as smooth, single-color molded plastic toy parts without gradients or painted-on details.
- Simplify outfits into broad, smooth 3D molded shapes. Do not include realistic cloth folds, fine wrinkles, decorative stitching, or delicate frills.
- Faithfully preserve each individual's actual attire type as shown in the reference image (e.g. traditional kurta, sherwani, lehenga, saree, or western pants, shirt) in simplified solid-color form. Under no circumstances replace traditional outfits with western jackets, blazers, or suits.

### Accessories & Ornaments — Simplified but included
Keep all visible accessories from the photo but simplify them into thick, sturdy, FDM-printable shapes:
- **Bangles/Bracelets:** Render as thick solid rings/bands around the wrists. Keep them visible and in the correct color but as simple cylindrical bands (no thin or delicate shapes).
- **Necklace/Mangalsutra/Chain:** Simplify into a thick solid band or collar around the neck. Preserve the color.
- **Earrings:** Simplify into small solid shapes (studs or thick drops) attached firmly to the head. No thin hooks or dangling parts.
- **Maang tikka/Headpiece:** Simplify into a small solid shape on the forehead, firmly attached.
- **Watches:** Simplify into a thick solid band around the wrist with a small flat rectangular face.
- **Buttons:** Include visible buttons on shirts, kurtas, sherwanis, and coats as small solid raised dots or cylinders on the garment surface.
- **Belts/Waist bands:** Simplify into a thick solid strip around the waist in the matching color.
- **Glasses/Sunglasses:** Simplify into a thick solid frame sitting on the face. Use chunky rounded frames, no thin wire frames.
- **Ties/Bowties:** Simplify into a small solid shape at the collar area.
- **Brooches/Pins:** Simplify into a small solid raised shape on the garment.
- **Turban/Pagdi:** Sculpt as a solid smooth mass on the head preserving the shape and color.
- Keep footwear simple and solid-colored (matching the photo), firmly resting on the base.
- All accessories must be thick enough to print on an FDM printer without breaking. No thin wires, chains, or fragile protrusions.

### FDM 3D-Printing & Geometry Requirements
1. Create a physically printable, watertight, manifold-style figurine design with solid, connected geometry. Use thick, sturdy features and rounded edges.
2. Avoid thin parts, fragile protrusions, deep narrow grooves, undercuts, unsupported overhangs, detached elements, and floating geometry that would break during FDM printing.
3. Keep the legs sturdy, the feet broad and flat, and the center of gravity balanced for stable standing.
4. Arms, hands, and garments must be securely integrated into the main body silhouette without fragile gaps.

### Base / Display Stand — Required
Include an integrated, solid display base beneath the figurine's feet. The base must be part of the final 3D model and must not be omitted.
- **Shape:** Choose a circular or oval base supporting all figures with a small margin around them, level and flat-bottomed for build plate adhesion.
- **Proportions:** Keep the base proportional to the figurine, with adequate thickness and rigidity for stable standing.
- **Inscription:** The base must have absolutely no text, no words, no letters, and no inscriptions on it unless custom engraving text is explicitly provided in the "Customer Personalization" section below. If no engraving text is specified, the base must be completely blank and smooth on all surfaces.
- **Attachment:** All feet must sit directly on and connect solidly to the base platform to ensure stability.

**Final requirement:** Always generate the complete full-body figurine standing on its own integrated display base, with smooth solid-color clothing that precisely matches the colors from the photo, simplified but visible accessories (bangles, necklace, earrings), and smooth surfaces accurately matching the subjects' faces, poses, and outfit colors. The base must have zero text unless explicitly requested.
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
