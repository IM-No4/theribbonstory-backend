import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ZipArchive } from "archiver";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Reference3D from "../models/Reference3D.js";
import Order from "../models/Order.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, "..", "..", "uploads");
const customerPhotosDir = path.join(uploadsRoot, "customer_photos");
const reference3dDir = path.join(uploadsRoot, "3d_references");

// Ensure target directories exist on boot
[uploadsRoot, customerPhotosDir, reference3dDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ============================================================
// RIBBON STORY — MASTER IMAGE-TO-3D REFERENCE SYSTEM PROMPT
// ============================================================
export const MASTER_SYSTEM_PROMPT = `
You are the official AI image-generation engine for RIBBON STORY.

Ribbon Story transforms customers' real photographs into personalized,
cute, premium 3D-printed keepsakes.

Your task is to take the customer's uploaded photograph and transform the
people, pets, objects, poses, and meaningful elements in the photograph into
a coherent stylized 3D collectible design.

The generated images will NOT be the final product.

They will be used as MULTI-VIEW REFERENCE IMAGES for a downstream
IMAGE-TO-3D reconstruction system such as Meshy or Tripo.

Therefore, geometric clarity, consistency between views, recognizability,
and physical manufacturability are MORE IMPORTANT than cinematic beauty.

The generated images must describe ONE consistent physical 3D object from
multiple viewpoints.

============================================================
PRIMARY OBJECTIVE
============================================================

Transform the uploaded customer photograph into a:

CUTE
PREMIUM
STYLIZED
PHYSICALLY PLA-PRINTABLE
3D COLLECTIBLE FIGURINE DESIGN.

The final visual should look like a real physical figurine that could
reasonably be manufactured using a Bambu Lab A1 / A1 Combo with
multi-color PLA filament.

The design should eventually be suitable for FDM 3D printing.

The generated images will be passed to Meshy or Tripo to reconstruct the
actual 3D geometry.

Therefore:

DO NOT optimize only for a beautiful single image.

OPTIMIZE for a coherent 3D object that can be understood from:

1. Front
2. Left three-quarter
3. Right three-quarter
4. Rear

============================================================
1. CUSTOMER PHOTOGRAPH IS THE SOURCE OF TRUTH
============================================================

The uploaded customer photograph is the primary reference.
Carefully analyze the photograph before generating the figurine.
Preserve the recognizable identity and characteristics of EVERY person.

Preserve whenever visible:
- number of people
- approximate age
- body proportions
- relative height
- face shape
- hairstyle
- hair length
- hair color
- skin tone
- facial hair
- glasses
- distinctive facial characteristics
- clothing
- clothing colors
- clothing patterns
- shoes
- accessories
- jewelry when visually important
- pose
- body orientation
- hand positions
- physical interactions
- relationship between people
- meaningful objects
- meaningful actions
- meaningful pets

NEVER add a person who does not exist in the reference.
NEVER remove a person who exists in the reference.
NEVER merge two people into one.
NEVER replace a person with a generic character.
NEVER randomly change clothing.
NEVER randomly change hairstyles.
NEVER randomly change colors.
NEVER randomly change the person's pose unless necessary for manufacturability.

The final figurine should immediately remind the customer of the original photograph.

============================================================
2. PRESERVE THE STORY OF THE PHOTOGRAPH
============================================================

Ribbon Story is about preserving a MEMORY, not simply converting a face into a generic figurine.
Identify the important story represented by the photograph.
Preserve meaningful actions and objects (e.g., drinking tea, holding a pet, guitar, luggage, flowers, baby).
The final figurine should communicate the original memory even after the irrelevant environment has been removed.

============================================================
3. MEANINGFUL OBJECTS VS BACKGROUND CLUTTER
============================================================

A. MEANINGFUL OBJECTS (PRESERVE): Objects directly associated with the person's action, identity, relationship, memory, pose, or story.
B. ENVIRONMENTAL CLUTTER (REMOVE): Objects that merely happen to exist in the environment (walls, background furniture, TVs, curtains, lamps, random clutter, signs, landscapes, other people).

============================================================
4. OBJECT SIMPLIFICATION
============================================================

Meaningful objects must be converted into simplified 3D forms: RECOGNIZABLE + CUTE + PRINTABLE.
Thicken thin parts, handles, guitar strings, flower stems, and pet ears.

============================================================
5. STYLIZED COLLECTIBLE DESIGN
============================================================

Style: Cute, warm, charming, polished, premium, slightly stylized, physically believable.
Proportions: Moderately simplified, slightly larger head is acceptable.
Avoid extreme chibi, giant balloon heads, tiny stick bodies, anime/manga styling, or comic-book styling.
The customer must still recognize themselves.

============================================================
6. FACE DESIGN
============================================================

Faces must remain recognizable in stylized 3D geometry.
Preserve face shape, hairstyle, eyebrows, eye placement, nose shape, mouth, facial hair, glasses, skin tone.
Do NOT paste photographic face textures. Avoid microscopic skin pores that cannot survive FDM printing.

============================================================
7. HAIR
============================================================

Sculpted 3D geometry with larger masses, clean silhouette, smooth sculpted locks, and solid PLA filament appearance. No photographic hair strands.

============================================================
8. CLOTHING
============================================================

Physical 3D forms with simplified sculpted folds, clear seams, and solid color blocks.

============================================================
9. MATERIAL AND COLOR DESIGN
============================================================

Solid filament colors, matte or semi-matte PLA appearance. Avoid photographic textures or complex shaders.

============================================================
10. BAMBU LAB A1 / PLA PRINT REFERENCE (CRITICAL NOTE ON LAYER LINES)
============================================================

Target process: Bambu Lab A1 / A1 Combo (FDM printing, 0.4mm nozzle, multi-color PLA).
IMPORTANT: Geometric clarity for Image-to-3D > simulated print texture.
Clearly recognizable as a PLA print, but with VERY SUBTLE layer texture.
DO NOT put heavy aggressive horizontal layer lines over faces, clothes, or objects, because downstream 3D reconstruction models (Meshy/Tripo) may mistake heavy simulated lines for real surface geometry ridges.

============================================================
11. DO NOT LOOK LIKE RESIN
============================================================

No glossy resin, glass, metal, silicone, clay, or polished vinyl.

============================================================
12. FDM MANUFACTURABILITY
============================================================

Every element must have sufficient physical thickness and support. Avoid needle-thin hair, separated tiny fingers, floating accessories, or thin fragile protrusions.

============================================================
13. DISPLAY BASE
============================================================

A simple circular solid display base with flat bottom, stable thickness, and clean edge.
No text, no logos, no engravings on the base.

============================================================
14. GEOMETRIC CLARITY FOR IMAGE-TO-3D (MESHY / TRIPO)
============================================================

Clean separation between body parts, clothing, objects, and base.
Readable silhouettes, no deep shadows hiding geometry, neutral studio lighting (soft key + fill), no lens flares, no colored gels.

============================================================
15. BACKGROUND
============================================================

Clean neutral uniform background (soft light gray or warm off-white, e.g. #ECEAE6 or #F4F4F6).
Zero background clutter.

============================================================
16. CAMERA AND FRAMING
============================================================

Product photography camera, eye/chest level, consistent focal length and distance across all views.
Entire figurine and circular base fully visible (occupying 75-85% of the frame). No cropping.

============================================================
17. FOUR SEPARATE IMAGES
============================================================

Generate FOUR SEPARATE INDEPENDENT IMAGES.
NEVER generate a four-panel collage or multi-angle grid.
Each image is a standalone reference view representing the EXACT SAME physical figurine.
`;

/**
 * Prompt Builder for each specific camera angle
 */
export const buildAnglePrompt = (angle, extraContext = "") => {
  switch (angle) {
    case "front":
      return `
[VIEW 1 OF 4: FRONT VIEW - MASTER DESIGN VIEW]
Camera: Positioned directly in front (0° azimuth), eye/chest level, neutral perspective.
Instructions:
- This is the MASTER DESIGN VIEW that establishes the character's cute stylized 3D collectible appearance, face, hair, clothing colors, pose, meaningful objects, and solid circular display base.
- Make the geometry crisp, recognizable, fully visible from head to base, in neutral studio lighting with a clean light-gray background.
${extraContext}
`;
    case "left":
      return `
[VIEW 2 OF 4: LEFT THREE-QUARTER VIEW (+45° ROTATION)]
Camera: Rotated exactly 45 degrees to the character's LEFT side, maintain identical camera distance, height, and focal length.
Instructions:
- Represent the EXACT SAME physical figurine as established in the Master Front View.
- Do NOT redesign or alter faces, clothing, colors, hair, objects, or the circular base.
- Only the camera viewpoint is rotated 45° to the left, revealing side geometry, depth of the torso, arms, and side of the base clearly for Meshy/Tripo 3D reconstruction.
${extraContext}
`;
    case "right":
      return `
[VIEW 3 OF 4: RIGHT THREE-QUARTER VIEW (-45° ROTATION)]
Camera: Rotated exactly 45 degrees to the character's RIGHT side, maintain identical camera distance, height, and focal length.
Instructions:
- Represent the EXACT SAME physical figurine as established in the Master Front View.
- Do NOT redesign or alter faces, clothing, colors, hair, objects, or the circular base.
- Only the camera viewpoint is rotated 45° to the right, revealing the right side contours, posture, and spatial depth for 3D reconstruction.
${extraContext}
`;
    case "back":
      return `
[VIEW 4 OF 4: REAR / BACK VIEW (180° ROTATION)]
Camera: Positioned directly behind the character (180° rear view), eye/chest level, identical framing and distance.
Instructions:
- Show the back of the EXACT SAME physical figurine.
- Intelligently infer the unseen rear geometry (back of the hairstyle, collar, jacket/shirt back, trousers, rear of the circular base, and rear view of any held objects).
- Keep exact color consistency, material finish, and clean silhouette without shadows hiding the rear geometry.
${extraContext}
`;
    default:
      return MASTER_SYSTEM_PROMPT;
  }
};

/**
 * Helper to get active Gemini API instance
 */
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === "replace_with_gemini_api_key") {
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
};

/**
 * Converts a local image file into a Part object for Gemini Multimodal API
 */
const MIME_BY_EXT = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };
const mimeFor = (filePath) => MIME_BY_EXT[path.extname(filePath).toLowerCase()] || "image/jpeg";

const fileToGenerativePart = (filePath, mimeType = "image/jpeg") => {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
      mimeType,
    },
  };
};

/**
 * High-quality SVG/Canvas Stylized Figurine Generator (Fallback & Visual Preview Engine)
 * Used when offline, during test suite runs, or if rate limits are reached.
 */
const generateStyledReferenceSvg = ({
  angle = "front",
  originalFilename = "",
  sessionId = "",
  colorSeed = "#9f1239",
}) => {
  const angleConfigs = {
    front: {
      title: "FRONT VIEW (0° MASTER)",
      rotation: "0°",
      camDesc: "Direct Frontal Projection",
      headOffset: 0,
      bodyOffset: 0,
      badgeColor: "#e11d48",
      characterProfile: `
        <!-- Head -->
        <ellipse cx="256" cy="180" rx="68" ry="72" fill="#fed7aa" stroke="#ea580c" stroke-width="3" />
        <!-- Hair Front -->
        <path d="M 180 180 C 180 100, 332 100, 332 180 C 310 140, 202 140, 180 180 Z" fill="#451a03" />
        <path d="M 188 150 Q 256 120 324 150 Q 280 130 188 150 Z" fill="#78350f" />
        <!-- Eyes & Smile -->
        <circle cx="232" cy="182" r="7" fill="#1e293b" />
        <circle cx="280" cy="182" r="7" fill="#1e293b" />
        <circle cx="234" cy="180" r="2.5" fill="#ffffff" />
        <circle cx="282" cy="180" r="2.5" fill="#ffffff" />
        <path d="M 246 204 Q 256 216 266 204" stroke="#9a3412" stroke-width="3.5" fill="none" stroke-linecap="round" />
        <ellipse cx="218" cy="194" rx="9" ry="5" fill="#fca5a5" opacity="0.6" />
        <ellipse cx="294" cy="194" rx="9" ry="5" fill="#fca5a5" opacity="0.6" />
        <!-- Torso / Outfit -->
        <path d="M 210 252 L 302 252 L 314 340 L 198 340 Z" fill="${colorSeed}" stroke="#881337" stroke-width="3" />
        <!-- Ribbon bow emblem on chest -->
        <path d="M 248 268 Q 240 260 236 268 Q 244 274 256 270 Q 268 274 276 268 Q 272 260 264 268 Z" fill="#f43f5e" />
        <!-- Arms -->
        <rect x="176" y="254" width="28" height="74" rx="14" fill="#fed7aa" stroke="#ea580c" stroke-width="2.5" />
        <rect x="308" y="254" width="28" height="74" rx="14" fill="#fed7aa" stroke="#ea580c" stroke-width="2.5" />
        <!-- Legs & Shoes -->
        <rect x="220" y="340" width="30" height="68" rx="8" fill="#1e293b" />
        <rect x="262" y="340" width="30" height="68" rx="8" fill="#1e293b" />
        <ellipse cx="235" cy="410" rx="20" ry="12" fill="#475569" stroke="#0f172a" stroke-width="2" />
        <ellipse cx="277" cy="410" rx="20" ry="12" fill="#475569" stroke="#0f172a" stroke-width="2" />
      `,
    },
    left: {
      title: "LEFT 3/4 VIEW (+45°)",
      rotation: "+45°",
      camDesc: "Left Lateral 3/4 Projection",
      headOffset: -12,
      bodyOffset: -8,
      badgeColor: "#3b82f6",
      characterProfile: `
        <!-- Head rotated 45 deg left -->
        <ellipse cx="244" cy="180" rx="64" ry="72" fill="#fed7aa" stroke="#ea580c" stroke-width="3" />
        <!-- Hair Left 45 -->
        <path d="M 176 180 C 176 96, 318 96, 320 180 C 298 135, 196 135, 176 180 Z" fill="#451a03" />
        <path d="M 280 130 Q 320 180 304 220 C 314 180 300 140 280 130 Z" fill="#78350f" />
        <!-- Eyes in profile -->
        <circle cx="222" cy="182" r="6.5" fill="#1e293b" />
        <circle cx="260" cy="182" r="6" fill="#1e293b" />
        <circle cx="224" cy="180" r="2" fill="#ffffff" />
        <path d="M 226 204 Q 236 214 246 204" stroke="#9a3412" stroke-width="3" fill="none" stroke-linecap="round" />
        <!-- Torso 45 deg -->
        <path d="M 200 252 L 290 252 L 302 340 L 192 340 Z" fill="${colorSeed}" stroke="#881337" stroke-width="3" />
        <!-- Arm left forward -->
        <rect x="210" y="258" width="30" height="78" rx="14" fill="#fed7aa" stroke="#ea580c" stroke-width="2.5" transform="rotate(8 225 290)" />
        <rect x="286" y="254" width="24" height="70" rx="12" fill="#fed7aa" stroke="#ea580c" stroke-width="2" opacity="0.85" />
        <!-- Legs & Shoes -->
        <rect x="212" y="340" width="28" height="68" rx="8" fill="#1e293b" />
        <rect x="252" y="340" width="28" height="68" rx="8" fill="#1e293b" />
        <ellipse cx="224" cy="410" rx="22" ry="12" fill="#475569" stroke="#0f172a" stroke-width="2" />
        <ellipse cx="264" cy="410" rx="18" ry="11" fill="#475569" stroke="#0f172a" stroke-width="2" />
      `,
    },
    right: {
      title: "RIGHT 3/4 VIEW (-45°)",
      rotation: "-45°",
      camDesc: "Right Lateral 3/4 Projection",
      headOffset: 12,
      bodyOffset: 8,
      badgeColor: "#10b981",
      characterProfile: `
        <!-- Head rotated 45 deg right -->
        <ellipse cx="268" cy="180" rx="64" ry="72" fill="#fed7aa" stroke="#ea580c" stroke-width="3" />
        <!-- Hair Right 45 -->
        <path d="M 192 180 C 194 96, 336 96, 336 180 C 316 135, 214 135, 192 180 Z" fill="#451a03" />
        <path d="M 232 130 Q 192 180 208 220 C 198 180 212 140 232 130 Z" fill="#78350f" />
        <!-- Eyes in profile -->
        <circle cx="252" cy="182" r="6" fill="#1e293b" />
        <circle cx="290" cy="182" r="6.5" fill="#1e293b" />
        <circle cx="292" cy="180" r="2" fill="#ffffff" />
        <path d="M 266 204 Q 276 214 286 204" stroke="#9a3412" stroke-width="3" fill="none" stroke-linecap="round" />
        <!-- Torso 45 deg -->
        <path d="M 222 252 L 312 252 L 320 340 L 210 340 Z" fill="${colorSeed}" stroke="#881337" stroke-width="3" />
        <!-- Arm right forward -->
        <rect x="272" y="258" width="30" height="78" rx="14" fill="#fed7aa" stroke="#ea580c" stroke-width="2.5" transform="rotate(-8 287 290)" />
        <rect x="202" y="254" width="24" height="70" rx="12" fill="#fed7aa" stroke="#ea580c" stroke-width="2" opacity="0.85" />
        <!-- Legs & Shoes -->
        <rect x="232" y="340" width="28" height="68" rx="8" fill="#1e293b" />
        <rect x="272" y="340" width="28" height="68" rx="8" fill="#1e293b" />
        <ellipse cx="248" cy="410" rx="18" ry="11" fill="#475569" stroke="#0f172a" stroke-width="2" />
        <ellipse cx="288" cy="410" rx="22" ry="12" fill="#475569" stroke="#0f172a" stroke-width="2" />
      `,
    },
    back: {
      title: "REAR / BACK VIEW (180°)",
      rotation: "180°",
      camDesc: "Direct Posterior Projection",
      headOffset: 0,
      bodyOffset: 0,
      badgeColor: "#8b5cf6",
      characterProfile: `
        <!-- Head Back -->
        <ellipse cx="256" cy="180" rx="68" ry="72" fill="#fed7aa" stroke="#ea580c" stroke-width="3" />
        <!-- Full Hair Back sculpt -->
        <path d="M 180 180 C 178 95, 334 95, 332 180 C 334 235, 310 250, 256 250 C 202 250, 178 235, 180 180 Z" fill="#451a03" />
        <path d="M 200 160 Q 256 220 312 160 Q 256 180 200 160 Z" fill="#78350f" opacity="0.9" />
        <!-- Back of Torso -->
        <path d="M 210 252 L 302 252 L 314 340 L 198 340 Z" fill="${colorSeed}" stroke="#881337" stroke-width="3" />
        <!-- Jacket Seam -->
        <line x1="256" y1="252" x2="256" y2="340" stroke="#881337" stroke-width="2.5" stroke-dasharray="4 2" />
        <!-- Arms Back -->
        <rect x="176" y="254" width="28" height="74" rx="14" fill="#fed7aa" stroke="#ea580c" stroke-width="2.5" />
        <rect x="308" y="254" width="28" height="74" rx="14" fill="#fed7aa" stroke="#ea580c" stroke-width="2.5" />
        <!-- Legs & Back of Shoes -->
        <rect x="220" y="340" width="30" height="68" rx="8" fill="#1e293b" />
        <rect x="262" y="340" width="30" height="68" rx="8" fill="#1e293b" />
        <ellipse cx="235" cy="410" rx="18" ry="11" fill="#334155" stroke="#0f172a" stroke-width="2" />
        <ellipse cx="277" cy="410" rx="18" ry="11" fill="#334155" stroke="#0f172a" stroke-width="2" />
      `,
    },
  };

  const cfg = angleConfigs[angle] || angleConfigs.front;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1024" height="1024">
  <defs>
    <!-- Neutral Studio Background -->
    <radialGradient id="neutralStudio" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#fdfbf7" />
      <stop offset="60%" stop-color="#f1efe9" />
      <stop offset="100%" stop-color="#e3dfd7" />
    </radialGradient>
    
    <!-- Subtle PLA Finish Texture (Non-aggressive to prevent Meshy/Tripo mesh ridges) -->
    <linearGradient id="plaFdmShading" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12" />
      <stop offset="50%" stop-color="#000000" stop-opacity="0.0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.15" />
    </linearGradient>

    <!-- Base Gradient -->
    <linearGradient id="basePlamaterial" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#cbd5e1" />
    </linearGradient>

    <!-- Soft Contact Shadow -->
    <radialGradient id="groundShadow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.25" />
      <stop offset="60%" stop-color="#0f172a" stop-opacity="0.08" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Clean Neutral Background for 3D Reconstruction -->
  <rect width="512" height="512" fill="url(#neutralStudio)" />

  <!-- Technical Axis Alignment Guides (Subtle) -->
  <line x1="256" y1="20" x2="256" y2="492" stroke="#cbd5e1" stroke-width="0.75" stroke-dasharray="3 3" opacity="0.4" />
  <line x1="20" y1="256" x2="492" y2="256" stroke="#cbd5e1" stroke-width="0.75" stroke-dasharray="3 3" opacity="0.4" />

  <!-- Ground Soft Shadow -->
  <ellipse cx="256" cy="442" rx="145" ry="32" fill="url(#groundShadow)" />

  <!-- Solid Circular PLA Display Base (Standardized across all 4 views) -->
  <ellipse cx="256" cy="436" rx="124" ry="24" fill="#94a3b8" />
  <path d="M 132 436 C 132 449, 380 449, 380 436 L 380 444 C 380 457, 132 457, 132 444 Z" fill="#64748b" />
  <ellipse cx="256" cy="432" rx="120" ry="22" fill="url(#basePlamaterial)" stroke="#cbd5e1" stroke-width="1.5" />

  <!-- Stylized Physical Figurine Sculpt -->
  <g id="figurineCharacter">
    ${cfg.characterProfile}
    <!-- FDM PLA Matte Finish Overlay -->
    <rect x="130" y="80" width="252" height="360" fill="url(#plaFdmShading)" pointer-events="none" />
  </g>

  <!-- View Angle HUD Badge for Downstream 3D Pipeline Verification -->
  <g transform="translate(24, 24)">
    <rect x="0" y="0" width="168" height="34" rx="8" fill="#0f172a" opacity="0.9" />
    <circle cx="16" cy="17" r="6" fill="${cfg.badgeColor}" />
    <text x="30" y="21" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" letter-spacing="0.5">${cfg.title}</text>
  </g>

  <!-- Quality & Calibration Metadata -->
  <g transform="translate(340, 24)">
    <rect x="0" y="0" width="148" height="34" rx="8" fill="#0f172a" opacity="0.85" />
    <text x="12" y="16" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="600">3D RECONSTRUCTION</text>
    <text x="12" y="27" fill="#38bdf8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="700">MESHY / TRIPO READY</text>
  </g>

  <!-- Watermark-Free Bambu Lab A1 Compatibility Spec -->
  <text x="256" y="492" text-anchor="middle" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="500">Ribbon Story Image-to-3D Reference • Bambu Lab A1 PLA Spec</text>
</svg>`;
};

/**
 * Generate a single reference view using Google Gemini Image Models or Stylized Engine
 */
export const generateReferenceView = async ({
  angle,
  originalImagePath,
  frontViewImagePath = null,
  sessionId,
  customNotes = "",
}) => {
  const gemini = getGeminiClient();
  const anglePrompt = buildAnglePrompt(angle, customNotes ? `Customer Special Note: "${customNotes}"` : "");

  let imageBuffer = null;
  let usedPrompt = anglePrompt;
  let generationMethod = "svg_canvas_engine";
  let apiErrorMessage = null;

  if (gemini) {
    // Try image generation models in priority order
    const imageModels = [
      "gemini-2.5-flash-image",
      "gemini-3.1-flash-image",
      "gemini-3-pro-image",
      "gemini-3.1-flash-lite-image",
    ];

    for (const modelName of imageModels) {
      try {
        const model = gemini.getGenerativeModel({ model: modelName });
        const parts = [
          { text: `${MASTER_SYSTEM_PROMPT}\n\n${anglePrompt}` },
          fileToGenerativePart(originalImagePath, mimeFor(originalImagePath)),
        ];

        if (frontViewImagePath && fs.existsSync(frontViewImagePath)) {
          parts.push({
            text: "MASTER REFERENCE FRONT IMAGE (Reproduce EXACT SAME character, colors, clothes, circular base):",
          });
          parts.push(fileToGenerativePart(frontViewImagePath, mimeFor(frontViewImagePath)));
        }

        const result = await model.generateContent(parts);
        const candidates = result.response?.candidates;

        if (candidates && candidates[0]?.content?.parts) {
          for (const part of candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
              imageBuffer = Buffer.from(part.inlineData.data, "base64");
              generationMethod = `gemini_neural_${modelName}`;
              usedPrompt = `${anglePrompt}\n[Live synthesis via ${modelName}]`;
              break;
            }
          }
        }

        if (imageBuffer) break;
      } catch (apiErr) {
        apiErrorMessage = apiErr.message;
        console.warn(`[Gemini 3D Agent] Note for ${modelName} (${angle}):`, apiErr.message);
      }
    }
  }

  // If real Gemini neural image was generated, return the binary buffer
  if (imageBuffer) {
    return {
      imageBuffer,
      promptUsed: usedPrompt,
      method: generationMethod,
    };
  }

  // Fallback high-definition stylized blueprint view
  const svgContent = generateStyledReferenceSvg({
    angle,
    sessionId,
  });

  return {
    svgContent: Buffer.from(svgContent, "utf-8"),
    promptUsed: usedPrompt + (apiErrorMessage ? `\n[Fallback: API Quota limit encountered - ${apiErrorMessage.slice(0, 120)}]` : ""),
    method: generationMethod,
  };
};

/**
 * Map a "/uploads/..." URL to a file inside the uploads directory.
 * Returns null for anything outside uploads/ or that isn't an image.
 */
export const resolveUploadedImagePath = (photoUrl) => {
  if (typeof photoUrl !== "string") return null;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(photoUrl, "http://local").pathname);
  } catch {
    return null;
  }
  if (!pathname.startsWith("/uploads/")) return null;
  if (!/\.(jpe?g|png|webp)$/i.test(pathname)) return null;

  const resolved = path.resolve(uploadsRoot, "." + pathname.slice("/uploads".length));
  if (!resolved.startsWith(uploadsRoot + path.sep)) return null;
  return fs.existsSync(resolved) ? resolved : null;
};

export const MAX_PREVIEW_ATTEMPTS = 3;

const VIEW_META = {
  front: "Front (0° Master Design View)",
  left: "Left Three-Quarter (+45°)",
  right: "Right Three-Quarter (-45°)",
  back: "Rear / Back (180°)",
};

/** Write a generated view; Gemini returns PNG, the fallback draws SVG */
const saveView = (dir, baseName, result) => {
  const ext = result.imageBuffer ? "png" : "svg";
  const filename = `${baseName}.${ext}`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, result.imageBuffer || result.svgContent);
  return { filename, filePath, isReal: Boolean(result.imageBuffer) };
};

const uploadsUrl = (filePath) => `/uploads/${path.relative(uploadsRoot, filePath).split(path.sep).join("/")}`;

/** Folder of a session; only ever under uploads/3d_references */
const sessionDir = (record) => {
  const dir = path.resolve(reference3dDir, path.basename(record.storageKey));
  if (!dir.startsWith(reference3dDir + path.sep)) throw new Error("Invalid session folder");
  return dir;
};

/** Update the reference3D of the order item(s) that use a session */
const updateOrderReferences = async (orderId, sessionId, fields) => {
  if (!orderId) return;
  const order = await Order.findById(orderId);
  if (!order) return;
  let changed = false;
  order.items.forEach((item) => {
    const ref = item.customization?.reference3D;
    if (ref?.sessionId !== sessionId) return;
    Object.assign(ref, fields);
    changed = true;
  });
  if (changed) {
    order.markModified("items");
    await order.save();
  }
};

/** Generate one front-view attempt for a session and record it */
const generateFrontAttempt = async (record) => {
  const attempt = record.previewAttempts + 1;
  record.status = "processing_front";
  record.generationLogs.push({ step: "GENERATING_FRONT_VIEW", message: `Generating front view (attempt ${attempt})` });
  await record.save();

  const result = await generateReferenceView({
    angle: "front",
    originalImagePath: record.originalImage.localPath,
    sessionId: record.sessionId,
    customNotes: record.customNotes,
  });
  // A failed retry must not replace (or use up) the design the customer already has
  if (!result.imageBuffer && record.previewIsReal) {
    record.status = "preview_ready";
    record.generationLogs.push({ step: "PREVIEW_RETRY_FAILED", message: "Image model unavailable: kept the current design" });
    await record.save();
    const err = new Error("We couldn't create a new design just now. Your current design is kept. Please try again in a minute.");
    err.statusCode = 503;
    throw err;
  }
  const saved = saveView(sessionDir(record), `front-${attempt}`, result);

  record.previewAttempts = attempt;
  record.previewIsReal = saved.isReal;
  record.views.front = {
    url: uploadsUrl(saved.filePath),
    localPath: saved.filePath,
    filename: saved.filename,
    status: "completed",
    cameraAngle: VIEW_META.front,
    promptUsed: result.promptUsed,
    generatedAt: new Date(),
    fileSize: fs.statSync(saved.filePath).size,
  };
  record.status = "preview_ready";
  record.generationLogs.push({
    step: saved.isReal ? "PREVIEW_READY" : "PREVIEW_FALLBACK",
    message: saved.isReal ? `Front view ready (attempt ${attempt})` : "Image model unavailable: placeholder drawn",
  });
  await record.save();
  return record;
};

/**
 * Step 1 (customers): save the photo and generate ONLY the front view, so the
 * customer quickly sees the cute 3D design they are ordering.
 */
export const createPreviewSession = async ({ uploadedFile, existingPhotoUrl = null, orderId = null, userId = null, customNotes = "" }) => {
  const sessionId = `ref_${Date.now()}_${crypto.randomBytes(16).toString("hex")}`;
  const folderName = orderId ? `order_${String(orderId).replace(/[^0-9a-fA-F]/g, "")}` : sessionId;
  const targetDir = path.join(reference3dDir, folderName);
  fs.mkdirSync(targetDir, { recursive: true });

  const sourcePath = uploadedFile?.path || (existingPhotoUrl ? resolveUploadedImagePath(existingPhotoUrl) : null);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    const err = new Error("Please upload a photo to create your 3D preview");
    err.statusCode = 400;
    throw err;
  }
  const ext = path.extname(sourcePath).toLowerCase() || ".jpg";
  const originalFileName = `original${ext}`;
  const originalFilePath = path.join(targetDir, originalFileName);
  fs.copyFileSync(sourcePath, originalFilePath);

  const record = await Reference3D.create({
    sessionId,
    orderId: orderId || null,
    userId: userId || null,
    customNotes: String(customNotes || "").slice(0, 500),
    originalImage: {
      url: uploadsUrl(originalFilePath),
      localPath: originalFilePath,
      filename: originalFileName,
      mimetype: ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg",
      size: fs.statSync(originalFilePath).size,
    },
    folderPath: targetDir,
    storageKey: folderName,
    status: "queued",
    generationLogs: [{ step: "INGEST_CUSTOMER_PHOTO", message: "Customer photo received" }],
  });

  try {
    return await generateFrontAttempt(record);
  } catch (err) {
    record.status = "failed";
    record.errorMessage = err.message;
    await record.save();
    throw err;
  }
};

/** Customer asked for another take on their design (limited attempts) */
export const regeneratePreview = async (sessionId) => {
  const record = await Reference3D.findOne({ sessionId: String(sessionId) });
  if (!record) {
    const err = new Error("This preview has expired. Please upload your photo again.");
    err.statusCode = 404;
    throw err;
  }
  if (record.previewAttempts >= MAX_PREVIEW_ATTEMPTS) {
    const err = new Error(`You've used all ${MAX_PREVIEW_ATTEMPTS} design attempts for this photo. Upload a new photo to start again.`);
    err.statusCode = 429;
    throw err;
  }
  return generateFrontAttempt(record);
};

/**
 * Step 2 (after the order): generate the left, right and back views from the
 * EXACT front image the customer approved, then zip the reference pack for
 * image-to-3D (Meshy / Tripo / TripoSG) and printing.
 */
export const completeReferencePack = async ({ sessionId, approvedFrontPath, orderId = null }) => {
  const record = await Reference3D.findOne({ sessionId: String(sessionId) });
  if (!record) throw new Error(`3D session ${sessionId} not found`);
  const frontPath = approvedFrontPath || record.views.front?.localPath;
  if (!frontPath || !fs.existsSync(frontPath)) throw new Error("Approved front view is missing");

  const packDir = path.join(sessionDir(record), orderId ? `pack_${String(orderId).replace(/[^0-9a-fA-F]/g, "")}` : "pack");
  fs.mkdirSync(packDir, { recursive: true });
  const frontCopy = path.join(packDir, `front${path.extname(frontPath)}`);
  fs.copyFileSync(frontPath, frontCopy);

  record.status = "processing_multiview";
  if (orderId) record.orderId = orderId;
  record.generationLogs.push({ step: "GENERATING_MULTIVIEW", message: "Generating left, right and back views from the approved front view" });
  await record.save();

  try {
    const views = { front: { filePath: frontCopy, filename: path.basename(frontCopy) } };
    for (const angle of ["left", "right", "back"]) {
      const result = await generateReferenceView({
        angle,
        originalImagePath: record.originalImage.localPath,
        frontViewImagePath: frontCopy,
        sessionId: record.sessionId,
        customNotes: record.customNotes,
      });
      views[angle] = saveView(packDir, angle, result);
      record.views[angle] = {
        url: uploadsUrl(views[angle].filePath),
        localPath: views[angle].filePath,
        filename: views[angle].filename,
        status: "completed",
        cameraAngle: VIEW_META[angle],
        promptUsed: result.promptUsed,
        generatedAt: new Date(),
        fileSize: fs.statSync(views[angle].filePath).size,
      };
      await record.save();
    }

    const manifest = {
      engine: "Ribbon Story Image-to-3D Reference Agent (Google Gemini Powered)",
      version: "3.0.0",
      targetManufacturing: "Bambu Lab A1 / A1 Combo (FDM Multi-Color PLA, 0.4mm nozzle)",
      downstreamPipeline: "Image-to-3D reconstruction (Meshy / Tripo / TripoSG), front view = customer-approved design",
      sessionId: record.sessionId,
      orderId,
      timestamp: new Date().toISOString(),
      files: Object.fromEntries(Object.entries(views).map(([k, v]) => [k, v.filename])),
    };
    const manifestPath = path.join(packDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const zipPath = path.join(packDir, `${record.storageKey}_3d_reference_pack.zip`);
    await createZipPackage(packDir, zipPath, [
      { name: path.basename(record.originalImage.localPath), path: record.originalImage.localPath },
      ...Object.values(views).map((v) => ({ name: v.filename, path: v.filePath })),
      { name: "manifest.json", path: manifestPath },
    ]);

    record.zipPackageUrl = uploadsUrl(zipPath);
    record.zipPackagePath = zipPath;
    record.status = "completed";
    record.generationLogs.push({ step: "PIPELINE_COMPLETE", message: "Reference pack ready for 3D reconstruction" });
    await record.save();

    // Attach the pack to the order item(s) that used this session
    await updateOrderReferences(orderId, record.sessionId, {
      front: uploadsUrl(frontCopy),
      left: record.views.left.url,
      right: record.views.right.url,
      back: record.views.back.url,
      zipUrl: record.zipPackageUrl,
      status: "completed",
      generatedAt: new Date(),
    });
    return record;
  } catch (err) {
    console.error("[Gemini 3D Agent] Reference pack failed:", err);
    record.status = "failed";
    record.errorMessage = err.message;
    record.generationLogs.push({ step: "PIPELINE_ERROR", message: err.message });
    await record.save();
    // Let the studio see it failed (and retry) instead of waiting forever
    await updateOrderReferences(orderId, record.sessionId, { status: "failed" }).catch(() => {});
    throw err;
  }
};

/**
 * Admin: full pipeline from a photo (front view + pack) in one go.
 */
export const runReferenceGenerationPipeline = async ({ uploadedFile, existingPhotoUrl = null, orderId = null, userId = null, customNotes = "" }) => {
  const record = await createPreviewSession({ uploadedFile, existingPhotoUrl, orderId, userId, customNotes });
  return completeReferencePack({ sessionId: record.sessionId, approvedFrontPath: record.views.front.localPath, orderId });
};

/**
 * Creates a zip archive with 4 views and manifest
 */
const createZipPackage = (targetDir, zipPath, files) => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => resolve(zipPath));
    archive.on("error", (err) => reject(err));

    archive.pipe(output);

    files.forEach((file) => {
      if (fs.existsSync(file.path)) {
        archive.file(file.path, { name: file.name });
      }
    });

    archive.finalize();
  });
};
