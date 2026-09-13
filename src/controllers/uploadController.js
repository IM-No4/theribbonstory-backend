export const uploadCustomizationPhoto = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  const url = `/uploads/${req.file.filename}`;
  return res.status(201).json({ url });
};
