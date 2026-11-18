import Order from "../models/Order.js";
import { getShiprocketOrderDetails } from "./shiprocketService.js";
import { notifyStatusChange } from "./orderNotifications.js";
import { restoreStock } from "./orderService.js";

const POLL_INTERVAL_MS = 30 * 60 * 1000;

/** Shiprocket sends dates as strings ("2026-11-20 10:00:00"); ignore empty/invalid ones */
export const parseShiprocketDate = (value) => {
  if (!value || typeof value !== "string" || value.startsWith("0000")) return undefined;
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T") + "+05:30");
  return isNaN(d) ? undefined : d;
};

/**
 * Copy pickup / expected-delivery dates from a Shiprocket payload onto the order.
 * Works for webhook bodies and for /orders/show shipment objects.
 */
export const applyShipmentDates = (order, src = {}) => {
  const pickup = parseShiprocketDate(src.pickup_scheduled_date);
  const etd = parseShiprocketDate(src.etd);
  if (pickup) order.pickupScheduledDate = pickup;
  if (etd) order.estimatedDelivery = etd;
};

/** Move the order to the status Shiprocket reports; returns true when it changed */
export const applyShipmentStatus = async (order, statusUpper) => {
  const settled = ["delivered", "cancelled"].includes(order.status);

  if (statusUpper.includes("CANCEL")) {
    if (order.status === "cancelled") return false;
    order.status = "cancelled";
    order.shipmentStatus = "CANCELLED";
    order.cancellationReason = "Cancelled via Shiprocket";
    order.cancelledAt = new Date();
    await restoreStock(order._id);
    return true;
  }
  if (settled) return false;

  if (statusUpper === "DELIVERED") {
    order.status = "delivered";
    order.shipmentStatus = "DELIVERED";
    order.deliveredAt = new Date();
    return true;
  }
  if (statusUpper.includes("OUT FOR DELIVERY")) {
    order.status = "shipped";
    order.shipmentStatus = "OUT_FOR_DELIVERY";
    return true;
  }
  if (!statusUpper.startsWith("RTO") && (statusUpper.includes("IN TRANSIT") || statusUpper.includes("PICKED UP"))) {
    order.status = "shipped";
    order.shipmentStatus = "IN_TRANSIT";
    return true;
  }
  return false;
};

/** Pull the latest state of one order from Shiprocket and save it */
export const syncOrderWithShiprocket = async (order) => {
  const { data: srData } = await getShiprocketOrderDetails(order.shiprocketOrderId);
  const shipment = Array.isArray(srData.shipments) ? srData.shipments[0] : srData.shipments;
  const srStatus = String(srData.status || shipment?.status || "").toUpperCase();
  const prevStatus = order.status;

  await applyShipmentStatus(order, srStatus);
  applyShipmentDates(order, { ...srData, ...shipment });

  if (srData.last_mile_awb) {
    order.awbCode = srData.last_mile_awb;
    order.trackingNumber = srData.last_mile_awb;
  }
  if (srData.last_mile_courier_name) {
    order.courierName = srData.last_mile_courier_name;
    order.courierPartner = srData.last_mile_courier_name;
  }

  await order.save();
  if (prevStatus !== order.status) notifyStatusChange(order, prevStatus);
  return { srStatus, changed: prevStatus !== order.status };
};

const syncShippedOrders = async () => {
  const orders = await Order.find({ status: "shipped", shiprocketOrderId: { $ne: "" } })
    .populate("user", "name email")
    .limit(100);
  for (const order of orders) {
    try {
      await syncOrderWithShiprocket(order);
    } catch (err) {
      console.error(`[ShipmentSync] ${order._id}: ${err.message}`);
    }
  }
};

/** Safety net for when Shiprocket's webhook is not configured or a call is missed */
export const scheduleShipmentSync = () => {
  setInterval(() => syncShippedOrders().catch((e) => console.error("[ShipmentSync]", e.message)), POLL_INTERVAL_MS).unref();
};
