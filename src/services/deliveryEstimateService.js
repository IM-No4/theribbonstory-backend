import Order from "../models/Order.js";
import { checkServiceability as checkShiprocketServiceability } from "./shiprocketService.js";

export const PRINTER_CAPACITY_PER_DAY = 1; // Single 3D printer capacity: 1 keepsake figurine per day
export const DAILY_PRINT_SLOTS = 3; // Daily studio 3D printing capacity slots
export const STANDARD_SHIPPING_FEE = 79;
export const EXPRESS_PRIORITY_FEE = 199;
export const FREE_SHIPPING_THRESHOLD = 999;

/**
 * Calculates remaining print slots available for today's run based on active queue:
 * E.g., when 0 ahead -> returns 3 ("Only 3 print slots left today")
 * When 1 ahead -> returns 2
 * When 2 ahead -> returns 1
 * When 3+ ahead -> returns 1 (urgent next batch spot)
 */
export function calculatePrintSlotsLeft(totalPendingUnits = 0, dailyCapacity = DAILY_PRINT_SLOTS) {
  const pending = Math.max(0, Number(totalPendingUnits) || 0);
  if (pending <= 0) return dailyCapacity;
  const remaining = dailyCapacity - (pending % dailyCapacity);
  return remaining === dailyCapacity ? 1 : Math.max(1, remaining);
}

/**
 * Returns current printer queue statistics from active database orders:
 * - expressPendingUnits: custom 3D items in Express priority queue
 * - standardPendingUnits: custom 3D items in Standard queue
 * - totalPendingUnits: total custom 3D items awaiting printing on single printer
 */
export async function getPrinterQueueStats() {
  try {
    const activeOrders = await Order.find({
      status: { $in: ["confirmed", "processing"] },
    }).select("items deliverySlot status createdAt");

    let expressPendingUnits = 0;
    let standardPendingUnits = 0;

    for (const order of activeOrders) {
      const isExpress =
        typeof order.deliverySlot === "string" &&
        order.deliverySlot.toLowerCase().includes("express");

      for (const item of order.items || []) {
        const isCustom3D = Boolean(
          item.customization?.photoUrl ||
          item.customization?.cuteImageUrl ||
          item.fromCatalog === false ||
          item.sizeId ||
          (item.name && item.name.toLowerCase().includes("3d"))
        );

        const isPrinted = item.customization?.productionStatus === "printed";

        if (isCustom3D && !isPrinted) {
          const qty = Number(item.quantity) || 1;
          if (isExpress) {
            expressPendingUnits += qty;
          } else {
            standardPendingUnits += qty;
          }
        }
      }
    }

    return {
      expressPendingUnits,
      standardPendingUnits,
      totalPendingUnits: expressPendingUnits + standardPendingUnits,
    };
  } catch (err) {
    console.error("Error fetching printer queue stats:", err);
    return {
      expressPendingUnits: 0,
      standardPendingUnits: 0,
      totalPendingUnits: 0,
    };
  }
}

/**
 * Calculates realistic delivery timeline based on:
 * - Product type (custom 3D print vs standard catalog)
 * - Order item quantities
 * - Real-time queue on the single 3D printer
 * - Express priority queue jump
 * - Courier transit days from Shiprocket / Pincode
 */
export async function calculateDeliveryEstimate({
  pincode,
  items = [],
  quantity = 1,
  isCustom3D = false,
  weight = 0.5,
  cod = 0,
}) {
  const queue = await getPrinterQueueStats();

  let hasCustom3D = Boolean(isCustom3D);
  let customUnits = 0;

  if (Array.isArray(items) && items.length > 0) {
    for (const item of items) {
      const is3D = Boolean(
        item.customization?.photoUrl ||
        item.customization?.cuteImageUrl ||
        item.fromCatalog === false ||
        item.sizeId ||
        item.hamper?.keepsakeId === "3d-miniature" ||
        (item.name && item.name.toLowerCase().includes("3d"))
      );

      if (is3D) {
        hasCustom3D = true;
        customUnits += Number(item.quantity) || 1;
      }
    }
  } else if (hasCustom3D) {
    customUnits = Math.max(1, Number(quantity) || 1);
  }

  // Get courier transit serviceability from Shiprocket or fallback
  let shiprocketResult = null;
  try {
    shiprocketResult = await checkShiprocketServiceability({
      deliveryPincode: pincode,
      weight,
      cod,
    });
  } catch {
    // Graceful fallback
  }

  const cleanPin = String(pincode || "").trim();
  const metroPrefixes = ["11", "40", "56", "50", "60", "70", "41", "12", "20", "38"];
  const isMetro = metroPrefixes.some((pfx) => cleanPin.startsWith(pfx));

  // Courier Transit Days (after completion of 3D printing & packaging):
  const courierDaysStandard = isMetro ? 2 : 4;
  const courierDaysExpress = isMetro ? 1 : 2;

  // 1. STANDARD OPTION:
  // - Queue delay: waits behind all existing Express AND Standard orders in queue
  // - Production time: customUnits * 1 day (or 1 day dispatch for catalog)
  const standardQueueDays = hasCustom3D ? (queue.expressPendingUnits + queue.standardPendingUnits) : 0;
  const standardProdDays = hasCustom3D ? customUnits : 1;
  const totalStandardDays = standardQueueDays + standardProdDays + courierDaysStandard;

  const standardEdd = new Date();
  standardEdd.setDate(standardEdd.getDate() + totalStandardDays);

  // 2. EXPRESS PRIORITY OPTION:
  // - Jumps ahead of standard queue! Only waits behind other Express orders
  // - Production time: customUnits * 1 day (or same-day dispatch for non-3D)
  const expressQueueDays = hasCustom3D ? queue.expressPendingUnits : 0;
  const expressProdDays = hasCustom3D ? customUnits : 0;
  const totalExpressDays = expressQueueDays + expressProdDays + courierDaysExpress;

  const expressEdd = new Date();
  expressEdd.setDate(expressEdd.getDate() + totalExpressDays);

  const formatDate = (date) =>
    date.toLocaleDateString("en-IN", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  const slotsLeft = calculatePrintSlotsLeft(queue.totalPendingUnits, DAILY_PRINT_SLOTS);
  const slotsLeftText = `Only ${slotsLeft} print slot${slotsLeft === 1 ? "" : "s"} left today`;

  return {
    success: true,
    serviceable: true,
    deliveryPincode: cleanPin,
    isMetro,
    hasCustom3D,
    customUnits,
    queueStats: {
      singlePrinterCapacity: "1 figurine/day",
      dailyCapacity: DAILY_PRINT_SLOTS,
      slotsLeft,
      slotsLeftText,
      totalQueueItemsAhead: queue.totalPendingUnits,
      expressQueueAhead: queue.expressPendingUnits,
      standardQueueAhead: queue.standardPendingUnits,
    },
    standard: {
      id: "standard",
      slotName: `Standard Delivery (${totalStandardDays} days)`,
      days: totalStandardDays,
      edd: standardEdd.toISOString(),
      formattedEDD: formatDate(standardEdd),
      breakdown: hasCustom3D
        ? `${standardQueueDays}d in queue + ${standardProdDays}d printing + ${courierDaysStandard}d courier transit`
        : `1d dispatch + ${courierDaysStandard}d courier transit`,
      explanation: hasCustom3D
        ? `Includes custom 3D studio printing (${slotsLeftText.toLowerCase()}), ${customUnits} keepsake print time, and courier transit.`
        : `Ready-to-ship order. Dispatched within 24h via courier.`,
      courierName: "Standard Courier Delivery",
      fee: STANDARD_SHIPPING_FEE,
    },
    express: {
      id: "express",
      slotName: `⚡ Express Priority Delivery (${totalExpressDays} days)`,
      days: totalExpressDays,
      edd: expressEdd.toISOString(),
      formattedEDD: formatDate(expressEdd),
      breakdown: hasCustom3D
        ? `${expressQueueDays}d priority queue + ${expressProdDays}d printing + ${courierDaysExpress}d Air transit`
        : `Same-day dispatch + ${courierDaysExpress}d Air transit`,
      explanation: hasCustom3D
        ? `⚡ Priority Queue: Jumps ahead of standard orders to print next on our single studio printer + prioritized Air Express.`
        : `Priority dispatch via Air Express.`,
      courierName: "Priority Air Delivery",
      priorityFee: EXPRESS_PRIORITY_FEE,
      totalFee: STANDARD_SHIPPING_FEE + EXPRESS_PRIORITY_FEE,
    },
    recommendedCourier: shiprocketResult?.recommendedCourier || {
      courier_name: "Express Air Delivery",
      rate: STANDARD_SHIPPING_FEE,
    },
  };
}
