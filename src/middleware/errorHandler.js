export const notFound = (req, res, next) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
};

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  const isDev = process.env.NODE_ENV === "development";
  if (statusCode >= 500) console.error(err);
  res.status(statusCode).json({
    // Hide internal error details for unexpected server errors outside development
    message: statusCode >= 500 && !isDev ? "Server error" : err.message || "Server error",
    stack: isDev ? err.stack : undefined,
  });
};
