import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const modelsDir = path.join(__dirname, "..", "..", "uploads", "models");

if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, modelsDir),
  filename: (req, file, cb) => {
    const cleanName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${cleanName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /\.(3mf|obj|stl|glb|gcode|zip|step|stp|blend|ply)$/i;
  const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
  if (extOk) return cb(null, true);
  cb(
    new Error(
      "Only 3D model files (.3mf, .obj, .stl, .glb, .gcode, .zip, .step) are allowed"
    )
  );
};

export const modelUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 60 * 1024 * 1024, files: 1 }, // 60MB max
});
