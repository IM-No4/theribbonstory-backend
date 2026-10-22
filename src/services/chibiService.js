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

export const FIGURINE_STYLES = {
  chibi: {
    id: "chibi",
    label: "Cute Chibi",
    tagline: "Adorable proportions, compact body & soft features",
    promptIntro: "Convert the uploaded reference photograph directly into a cute, high-quality 3D-printable chibi figurine. Full-body collectible miniature figurine standing on an integrated circular display stand.",
    sculptingGuide: `3D PRINT-READY CHIBI SCULPTING:
- Convert the subject into a cute chibi 3D figurine style: slightly oversized head, adorable expressive features, compact body, sturdy limbs, standing in a stable pose.
- The primary purpose is real-world 3D printing: simplify complex fabric wrinkles, loose threads, and intricate patterns into clean, smooth, solid-colored sculpted surfaces to make 3D printing clean and effortless.
- Solid, watertight manifold geometry with thick connected features, no fragile or floating pieces.`
  },
  caricature: {
    id: "caricature",
    label: "Fun Caricature",
    tagline: "Playful cartoon exaggeration & charming smile",
    promptIntro: "Convert the uploaded reference photograph directly into a fun, stylized 3D-printable cartoon caricature figurine. Full-body collectible miniature figurine standing on an integrated circular display stand.",
    sculptingGuide: `3D PRINT-READY CARICATURE SCULPTING:
- Convert the subject into a playful, stylized cartoon caricature 3D figurine: playfully accentuate their signature smile, joyful facial expression, and distinctive hairstyle while keeping them immediately recognizable.
- Dynamic, charming, humorous and warm cartoon proportions with a slightly enlarged expressive head and lively character posture.
- Designed specifically for real-world 3D printing: smooth planar cartoon contours, solid color blocking, and clean sculpted geometry with no fragile or floating pieces.`
  },
  realistic: {
    id: "realistic",
    label: "Mini Realistic",
    tagline: "True-to-life human proportions & detailed sculpt",
    promptIntro: "Convert the uploaded reference photograph directly into a realistic miniature 3D-printable portrait figurine. Full-body collectible miniature figurine standing on an integrated circular display stand.",
    sculptingGuide: `3D PRINT-READY REALISTIC SCULPTING:
- Convert the subject into a miniature realistic 3D portrait figurine: maintain natural, realistic human anatomy, proportions, accurate facial contours, and authentic posture.
- Faithful lifelike sculpture with realistic head-to-body ratio, authentic clothing folds, and refined portrait details.
- Engineered for physical 3D printing: structurally reinforced limbs and ankles, solid watertight manifold geometry, firmly grounded on the display pedestal.`
  },
  bobblehead: {
    id: "bobblehead",
    label: "Classic Bobblehead",
    tagline: "Prominent expressive head & collectible trophy stance",
    promptIntro: "Convert the uploaded reference photograph directly into a classic collectible 3D-printable bobblehead figurine. Full-body collectible miniature figurine standing on an integrated circular trophy pedestal.",
    sculptingGuide: `3D PRINT-READY BOBBLEHEAD SCULPTING:
- Convert the subject into a classic collectible bobblehead figurine style: prominent oversized detailed head with cheerful expressive features, resting on a cute compact body with a sturdy reinforced neck joint.
- Fun collectible trophy stance, standing proudly on an integrated tiered circular trophy pedestal.
- Designed for real-world 3D printing: reinforced neck connection, solid thick geometry, stable center of gravity, with smooth vibrant surfaces.`
  }
};

export async function getActivePrintColors() {
  try {
    const { default: StudioSettings, DEFAULT_PRINT_COLORS } = await import("../models/StudioSettings.js");
    const settings = await StudioSettings.findOne({ key: "default" }).lean();
    if (settings && Array.isArray(settings.availableColors) && settings.availableColors.length > 0) {
      const active = settings.availableColors.filter((c) => c.isActive !== false);
      if (active.length > 0) return active;
    }
    return DEFAULT_PRINT_COLORS.filter((c) => c.isActive !== false);
  } catch (err) {
    console.warn("Could not load print colors from DB:", err.message);
    return [
      { name: "White", hex: "#FFFFFF" },
      { name: "Black", hex: "#111111" },
      { name: "Beige / Skin", hex: "#F5D0B0" },
      { name: "Red", hex: "#E53E3E" },
      { name: "Blue", hex: "#3182CE" },
      { name: "Yellow", hex: "#D69E2E" },
      { name: "Green", hex: "#38A169" },
      { name: "Brown", hex: "#7B341E" },
      { name: "Grey", hex: "#718096" },
      { name: "Pink", hex: "#ED64A6" },
      { name: "Orange", hex: "#DD6B20" },
    ];
  }
}

export function buildFigurinePrompt(styleKey = "chibi", customPrompt = null, printColors = null) {
  const style = FIGURINE_STYLES[styleKey] || FIGURINE_STYLES.chibi;

  const colorNames = Array.isArray(printColors) && printColors.length > 0
    ? printColors.map((c) => (typeof c === "string" ? c : c.name)).filter(Boolean)
    : ["White", "Black", "Beige/Skin", "Red", "Blue", "Yellow", "Green", "Brown", "Grey", "Pink", "Orange"];

  const basePrompt = `${style.promptIntro}

SOLID-COLOR SCULPT (HIGHEST PRIORITY): Every part of the figurine is a smooth, matte, single-color moulded plastic surface, like a vinyl toy. Each color region is one flat uniform color with no texture, no printed or embossed pattern, no fabric weave, and no fine lines.

Palette: max 4 colors from [${colorNames.join(", ")}]. Snap every photo color to the nearest one.

HEADWEAR (turban, cap, scarf): Sculpt only the overall silhouette of the headwear as one smooth, solid, uniformly colored shape with soft rounded folds. The surface is plain matte red (or the nearest palette color) with no print, no embroidery, no bandhani dots, no motifs, and no fabric texture. It should look like a plain painted plastic cap.

FACIAL HAIR: Only if the person clearly has a beard or mustache, sculpt it as ONE solid, smooth, rounded block of black or brown plastic that follows the jaw and upper lip, like a painted vinyl toy beard. It has a clean edge against the skin, and the whole shape is a single solid mass with no individual hairs, strands, stubble, or fade. If the person has no facial hair, the face is completely smooth. Hair on the head follows the same rule: one solid sculpted shape, no strands.

CLOTHING: Sculpt only the overall silhouette of each garment (shirt, pants, dress, jacket) as smooth, solid, block-colored moulded plastic surfaces with no graphics, logos, prints, checks, stripes, or fabric weave. Each garment is one solid uniform color from your 4-color palette.

SUBJECT FIDELITY:
- Faithfully preserve the exact person (or people) from the reference photo: match their face, gender, skin tone, eye expression, and likeness.
- If multiple people are in the photo, sculpt all of them standing together on the shared base.

${style.sculptingGuide}

BASE / PEDESTAL:
- The figurine stands firmly attached on a solid, clean, circular display pedestal.
- Keep the base smooth and blank with no text or letters, unless custom engraving text is explicitly specified below.`.trim();

  if (customPrompt && typeof customPrompt === "string" && customPrompt.trim()) {
    if (customPrompt.includes("3D-printable") && (customPrompt.includes("SOLID-COLOR SCULPT") || customPrompt.includes("CRITICAL SUBJECT"))) {
      return customPrompt.trim();
    }
    return `${basePrompt}\n\n### Customer Personalization & Custom Details:\n${customPrompt.trim()}`;
  }

  return basePrompt;
}

export const DEFAULT_CHIBI_PROMPT = buildFigurinePrompt("chibi");

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
 * Generates a 3D figurine image from a local file path
 */
export async function generateChibiFromLocalFile(localFilePath, customPrompt = null, style = "chibi") {
  const client = await getClient();
  const printColors = await getActivePrintColors();
  const prompt = buildFigurinePrompt(style, customPrompt, printColors);

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
export async function generateChibiFromUrl(photoUrl, customPrompt = null, style = "chibi") {
  if (!photoUrl) {
    throw new Error("Photo URL is required");
  }

  // If it's a local /uploads/ URL, resolve it directly on disk
  if (photoUrl.startsWith("/uploads/") || photoUrl.startsWith("uploads/")) {
    const relativePath = photoUrl.replace(/^\/?uploads\//, "");
    const localDiskPath = path.join(uploadsDir, relativePath);

    try {
      await fs.access(localDiskPath);
      return await generateChibiFromLocalFile(localDiskPath, customPrompt, style);
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

    return await generateChibiFromLocalFile(tmpPath, customPrompt, style);
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}
