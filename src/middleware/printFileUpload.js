import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Production print files (STL/3MF/OBJ) live outside the public uploads/
 * folder, so they are never reachable by URL; only the admin download
 * endpoint can serve them.
 */
export const printFilesDir = path.join(__dirname, "..", "..", "private_uploads", "print-files");
fs.mkdirSync(printFilesDir, { recursive: true });

export const PRINT_FILE_EXTENSIONS = [".stl", ".3mf", ".obj"];
export const MAX_PRINT_FILE_BYTES = 200 * 1024 * 1024;

const printFileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, printFilesDir),
    filename: (req, file, cb) =>
      cb(null, `${crypto.randomBytes(16).toString("hex")}${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (PRINT_FILE_EXTENSIONS.includes(ext)) return cb(null, true);
    cb(new Error(`Only ${PRINT_FILE_EXTENSIONS.join(", ")} print files are allowed`));
  },
  limits: { fileSize: MAX_PRINT_FILE_BYTES, files: 1 },
});

/** Single "file" field; turns multer errors into 400 responses */
export const uploadPrintFile = (req, res, next) => {
  printFileUpload.single("file")(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `Print file is too large (max ${MAX_PRINT_FILE_BYTES / 1024 / 1024} MB)`
        : err.message;
    return res.status(400).json({ message });
  });
};

/** Absolute path of a stored print file, refusing anything outside printFilesDir */
export const printFilePath = (filename) => {
  const resolved = path.resolve(printFilesDir, path.basename(String(filename || "")));
  return resolved.startsWith(printFilesDir + path.sep) ? resolved : null;
};

export const deletePrintFile = (filename) => {
  const file = printFilePath(filename);
  if (file) fs.unlink(file, () => {});
};
