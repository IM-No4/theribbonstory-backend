import mongoose from "mongoose";

/** Named sequences, e.g. invoice numbers per financial year ("invoice-2026-27") */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export default mongoose.model("Counter", counterSchema);
