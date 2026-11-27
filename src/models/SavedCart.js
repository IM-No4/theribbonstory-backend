import mongoose from "mongoose";

const lineSchema = new mongoose.Schema(
  {
    productId: String,
    name: String,
    image: String,
    price: Number, // per unit, including options
    basePrice: Number,
    quantity: Number,
    options: [{ _id: false, name: String, value: String, priceDelta: Number }],
    custom: { type: Boolean, default: false }, // personalised items stay on the customer's device
  },
  { _id: false }
);

/** A copy of a signed-in customer's bag, so it can be restored and followed up */
const savedCartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  items: [lineSchema],
  // When the contents last changed (viewing the site again doesn't count)
  changedAt: { type: Date, default: Date.now, index: true },
});

export default mongoose.model("SavedCart", savedCartSchema);
