
import path from "path";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { Client, handle_file } from "@gradio/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
const chibiOutputDir = path.join(uploadsDir, "chibi");

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
    promptIntro:
      "Transform ONLY the person/subject from the uploaded reference photo into a cute, 3D-printable chibi figurine standing on an integrated circular display base. Completely remove the original photo background and isolate the figurine on a clean, plain studio background.",
    sculptingGuide:
      "Use a slightly oversized head, compact body, soft features and sturdy limbs. Keep the person recognizable. Use simple, smooth sculpted forms suitable for physical 3D printing.",
  },

  caricature: {
    id: "caricature",
    label: "Fun Caricature",
    tagline: "Playful cartoon exaggeration & charming smile",
    promptIntro:
      "Transform ONLY the person/subject from the uploaded reference photo into a stylized, 3D-printable caricature figurine standing on an integrated circular display base. Completely remove the original photo background and isolate the figurine on a clean, plain studio background.",
    sculptingGuide:
      "Use playful cartoon proportions and expressive features. Gently exaggerate the person's existing facial expression and distinctive features without changing their identity or inventing new features. Use sturdy, smooth sculpted forms.",
  },

  realistic: {
    id: "realistic",
    label: "Mini Realistic",
    tagline: "True-to-life human proportions & detailed sculpt",
    promptIntro:
      "Transform ONLY the person/subject from the uploaded reference photo into a realistic miniature 3D portrait figurine standing on an integrated circular display base. Completely remove the original photo background and isolate the figurine on a clean, plain studio background.",
    sculptingGuide:
      "Preserve natural human proportions, facial contours, hairstyle, expression and posture. Create a lifelike miniature sculpture with simplified details suitable for physical 3D printing.",
  },

  bobblehead: {
    id: "bobblehead",
    label: "Classic Bobblehead",
    tagline: "Prominent expressive head & collectible trophy stance",
    promptIntro:
      "Transform ONLY the person/subject from the uploaded reference photo into a collectible, 3D-printable bobblehead figurine standing on an integrated circular display base. Completely remove the original photo background and isolate the figurine on a clean, plain studio background.",
    sculptingGuide:
      "Use a noticeably oversized head and a compact body, with a sturdy neck connection and stable standing pose. Preserve the person's recognizable face, hairstyle, clothing and actual features.",
  },
};

export async function getActivePrintColors() {
  try {
    const {
      default: StudioSettings,
      DEFAULT_PRINT_COLORS,
    } = await import("../models/StudioSettings.js");

    const settings = await StudioSettings.findOne({
      key: "default",
    }).lean();

    if (
      settings &&
      Array.isArray(settings.availableColors) &&
      settings.availableColors.length > 0
    ) {
      const active = settings.availableColors.filter(
        (color) => color.isActive !== false
      );

      if (active.length > 0) return active;
    }

    return DEFAULT_PRINT_COLORS.filter(
      (color) => color.isActive !== false
    );
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

/**
 * Builds a concise prompt that prioritizes reference-photo fidelity.
 * The selected style changes sculpting proportions, not the person's identity.
 */
export function buildFigurinePrompt(
  styleKey = "chibi",
  customPrompt = null,
  printColors = null
) {
  const style = FIGURINE_STYLES[styleKey] || FIGURINE_STYLES.chibi;

  const colorNames =
    Array.isArray(printColors) && printColors.length > 0
      ? printColors
          .map((color) =>
            typeof color === "string" ? color : color.name
          )
          .filter(Boolean)
      : [
          "White",
          "Black",
          "Beige/Skin",
          "Red",
          "Blue",
          "Yellow",
          "Green",
          "Brown",
          "Grey",
          "Pink",
          "Orange",
        ];

  const basePrompt = `${style.promptIntro}

BACKGROUND & ENVIRONMENT (MANDATORY - REMOVE ORIGINAL BACKGROUND):
- Completely remove and discard the original background and setting from the photo.
- Do NOT keep any background scenery, landscape, water, river, bridge, sky, buildings, walls, ground, or environment from the uploaded photo.
- The 3D figurine and its circular base must be cleanly isolated in a professional product studio setting on a solid, plain, seamless light neutral background (smooth off-white / light gray studio backdrop #F4F4F6).
- Include only soft, balanced studio photography lighting and a subtle contact shadow cast directly under the circular base onto the clean studio ground.
- Zero clutter, zero landscape, zero outdoor elements.

REFERENCE PHOTO IS THE SOURCE OF TRUTH (SUBJECT ONLY):
Extract and reproduce ONLY the person shown in the uploaded photo. Discard all background scenery and environment. Preserve their visible gender presentation, face, skin tone, hairstyle, facial hair, expression, clothing, accessories and pose.

Do not invent or assume features. Do not add a turban, hat, head covering, beard, moustache, jewellery or other accessory unless it is clearly present in the reference. Do not remove features that are present. If a detail is unclear or hidden, keep it simple instead of guessing. For multiple people, preserve each person's distinct appearance.

SELECTED STYLE:
${style.sculptingGuide}

3D-PRINTABLE FINISH:
Create a physical-looking matte PLA figurine with smooth, solid-color surfaces. Use no more than 4 colors from this palette: ${colorNames.join(", ")}. Match the visible colors in the photo as closely as the palette allows. Simplify tiny details only when needed for printing; do not change the person's identity or add decorative details. Use sturdy connected features, stable feet and printable geometry.

BASE:
Attach the full figurine to a simple, smooth, blank circular display base standing on the clean studio surface. No text or engraving unless explicitly requested.`;

  if (typeof customPrompt === "string" && customPrompt.trim()) {
    return `${basePrompt}

CUSTOMER-REQUESTED DETAILS:
Apply these details only when explicitly requested and consistent with the reference person's actual appearance. Maintain the clean, isolated studio background with zero clutter. Do not use them to replace or alter the person's identity.

${customPrompt.trim()}`;
  }

  return basePrompt;
}

export const DEFAULT_CHIBI_PROMPT = buildFigurinePrompt("chibi");

/**
 * Downloads the generated image and saves it permanently.
 */
async function saveGradioImageLocally(gradioUrl) {
  const response = await fetch(gradioUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download generated image from Gradio: ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const filename = `chibi-${Date.now()}-${Math.floor(
    Math.random() * 1e8
  )}.png`;

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
 * Generates a figurine image from a local image file.
 */
export async function generateChibiFromLocalFile(
  localFilePath,
  customPrompt = null,
  style = "chibi"
) {
  const client = await getClient();
  const printColors = await getActivePrintColors();
  const prompt = buildFigurinePrompt(style, customPrompt, printColors);

  const payload = {
    prompt,
    seed: Math.floor(Math.random() * 2147483647),
    aspect_ratio: "3:4",
  };

  console.log("\n==================== [FIGURINE GENERATION REQUEST] ====================");
  console.log(`[Timestamp]: ${new Date().toISOString()}`);
  console.log(`[Space Target]: ${SPACE}`);
  console.log(`[Input Image]: ${localFilePath}`);
  console.log(`[Seed]: ${payload.seed}`);
  console.log(`[Aspect Ratio]: ${payload.aspect_ratio}`);
  console.log(`[Prompt Length]: ${payload.prompt.length} characters`);
  console.log("-------------------- [PROMPT TEXT] --------------------");
  console.log(payload.prompt);
  console.log("=======================================================================\n");

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
    console.error("\n==================== [FIGURINE GENERATION ERROR] ====================");
    console.error(`[Failed After]: ${Date.now() - startTime}ms`);
    console.error("[Error]:", err.message || err);
    console.error("=====================================================================\n");
    throw err;
  }

  const durationMs = Date.now() - startTime;
  const outputItem = result?.data?.[0];
  const fileUrl = outputItem?.url;

  console.log("\n==================== [FIGURINE GENERATION RESPONSE] ====================");
  console.log(`[Duration]: ${durationMs}ms`);
  console.log(`[Generated URL]: ${fileUrl || "None"}`);
  console.log("========================================================================\n");

  if (!fileUrl) {
    throw new Error(
      "No image output returned from Qwen Turbo figurine generation"
    );
  }

  return await saveGradioImageLocally(fileUrl);
}

/**
 * Generates a figurine image from an existing photo URL.
 * Supports local /uploads/ URLs and external URLs.
 */
export async function generateChibiFromUrl(
  photoUrl,
  customPrompt = null,
  style = "chibi"
) {
  if (!photoUrl) {
    throw new Error("Photo URL is required");
  }

  if (
    photoUrl.startsWith("/uploads/") ||
    photoUrl.startsWith("uploads/")
  ) {
    const relativePath = photoUrl.replace(/^\/?uploads\//, "");
    const localDiskPath = path.join(uploadsDir, relativePath);

    try {
      await fs.access(localDiskPath);
      return await generateChibiFromLocalFile(
        localDiskPath,
        customPrompt,
        style
      );
    } catch {
      // If the local file is unavailable, try fetching it over HTTP.
    }
  }

  let resolvedUrl = photoUrl;

  if (photoUrl.startsWith("/")) {
    resolvedUrl = `http://localhost:${process.env.PORT || 5050}${photoUrl}`;
  }

  const tmpPath = path.join(
    os.tmpdir(),
    `chibi-input-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`
  );

  try {
    const response = await fetch(resolvedUrl);

    if (!response.ok) {
      throw new Error(`Could not fetch photo from ${resolvedUrl}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);

    return await generateChibiFromLocalFile(
      tmpPath,
      customPrompt,
      style
    );
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}
