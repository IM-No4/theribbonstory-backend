import StudioSettings, { SHIPPING_DEFAULTS } from "../models/StudioSettings.js";

const FIELDS = Object.keys(SHIPPING_DEFAULTS);
const MAX_AMOUNT = 100000;

/**
 * Delivery charges as managed in the admin panel (StudioSettings.shipping).
 * SHIPPING_DEFAULTS only applies until an admin saves values for the first time.
 */
export const getShippingSettings = async () => {
  const settings = await StudioSettings.findOne({ key: "default" }).select("shipping").lean();
  return Object.fromEntries(FIELDS.map((f) => [f, settings?.shipping?.[f] ?? SHIPPING_DEFAULTS[f]]));
};

/** Validates admin input; returns { values } or { error } */
export const parseShippingSettings = (body = {}) => {
  const values = {};
  for (const field of FIELDS) {
    const raw = body[field];
    const amount = Number(raw);
    if (raw === "" || raw === null || raw === undefined || !Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
      return { error: `Enter a whole rupee amount from 0 to ${MAX_AMOUNT} for every field` };
    }
    values[field] = amount;
  }
  return { values };
};
