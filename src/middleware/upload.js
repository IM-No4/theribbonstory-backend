import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowed.test(file.mimetype);
  if (extOk && mimeOk) return cb(null, true);
  cb(new Error("Only image files (jpg, png, webp) are allowed"));
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const IMAGE_SIGNATURES = [
  (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, // JPEG
  (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), // PNG
  (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP", // WEBP
];

const isRealImage = (filePath) => {
  try {
    const fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(12);
    fs.readSync(fd, header, 0, 12, 0);
    fs.closeSync(fd);
    return IMAGE_SIGNATURES.some((check) => check(header));
  } catch {
    return false;
  }
};

/**
 * Runs after multer: deletes any uploaded file whose contents are not a
 * JPEG/PNG/WEBP image (the extension and MIME type are client-controlled).
 */
export const verifyUploadedImages = (req, res, next) => {
  const files = [...(req.files || []), ...(req.file ? [req.file] : [])];
  const unique = [...new Map(files.map((f) => [f.path, f])).values()];
  const invalid = unique.filter((f) => !isRealImage(f.path));
  if (invalid.length > 0) {
    unique.forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(400).json({ message: "Only image files (jpg, png, webp) are allowed" });
  }
  next();
};

export const UPLOAD_MAX_DIMENSION = 2000;
export const UPLOAD_WEBP_QUALITY = 85;

/**
 * Runs after verifyUploadedImages: re-encode each image as WebP, at most
 * 2000px on its long side, rotated upright from the camera's EXIF
 * orientation and with all metadata (including phone GPS location)
 * removed. A 4 MB phone photo typically ends up around 200-400 KB.
 */
export const optimizeUploadedImages = async (req, res, next) => {
  const files = [...new Map([...(req.files || []), ...(req.file ? [req.file] : [])].map((f) => [f.path, f])).values()];
  try {
    for (const file of files) {
      const outName = `${path.parse(file.filename).name}.webp`;
      const outPath = path.join(path.dirname(file.path), outName);
      // Write to a temp file first: the input may already be <name>.webp
      const tmpPath = `${outPath}.tmp`;
      const info = await sharp(file.path, { failOn: "error" })
        .rotate()
        .resize({ width: UPLOAD_MAX_DIMENSION, height: UPLOAD_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
        .webp({ quality: UPLOAD_WEBP_QUALITY })
        .toFile(tmpPath);
      await fs.promises.rename(tmpPath, outPath);
      if (outPath !== file.path) fs.unlink(file.path, () => {});
      Object.assign(file, { filename: outName, path: outPath, mimetype: "image/webp", size: info.size });
    }
    next();
  } catch (err) {
    files.forEach((f) => {
      fs.unlink(f.path, () => {});
      fs.unlink(`${path.join(path.dirname(f.path), path.parse(f.filename).name)}.webp.tmp`, () => {});
    });
    console.warn("[Upload] Could not process image:", err.message);
    res.status(400).json({ message: "This image could not be processed. Please try a different photo." });
  }
};
