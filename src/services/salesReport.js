import Order from "../models/Order.js";

/** India Standard Time (no daylight saving): days start at IST midnight */
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const RANGES = { today: 1, "7d": 7, "30d": 30 };

const istDay = (date) => new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
/** Start of the IST day `daysAgo` days before `now`, as a UTC instant */
const istMidnight = (now, daysAgo = 0) => {
  const shifted = now + IST_OFFSET_MS;
  return new Date(shifted - (shifted % DAY_MS) - daysAgo * DAY_MS - IST_OFFSET_MS);
};

/** Orders that count as sales: placed (paid or COD), not cancelled or refunded */
const isSale = (o) => o.status !== "cancelled" && !(o.isRefunded && o.refundStatus === "refunded");
const sumRevenue = (orders) => orders.reduce((s, o) => s + (o.totalPrice || 0), 0);

export const summarizeSales = (orders, { from, to, previous = [], days }) => {
  const sales = orders.filter(isSale);
  const revenue = sumRevenue(sales);
  const prevSales = previous.filter(isSale);

  const byDayMap = new Map();
  for (let d = 0; d < days; d += 1) byDayMap.set(istDay(from.getTime() + d * DAY_MS), { revenue: 0, orders: 0 });
  for (const o of sales) {
    const bucket = byDayMap.get(istDay(o.createdAt));
    if (bucket) {
      bucket.revenue += o.totalPrice || 0;
      bucket.orders += 1;
    }
  }

  const split = { cod: { orders: 0, revenue: 0 }, online: { orders: 0, revenue: 0 } };
  for (const o of sales) {
    const key = o.paymentMethod === "cod" ? "cod" : "online";
    split[key].orders += 1;
    split[key].revenue += o.totalPrice || 0;
  }

  const products = new Map();
  for (const o of sales) {
    for (const item of o.items || []) {
      const key = item.name || "Item";
      const p = products.get(key) || { name: key, quantity: 0, revenue: 0, image: item.image || "" };
      p.quantity += item.quantity || 0;
      p.revenue += (item.price || 0) * (item.quantity || 0);
      products.set(key, p);
    }
  }

  const count = (statuses) => orders.filter((o) => statuses.includes(o.status)).length;

  return {
    from,
    to,
    revenue,
    orders: sales.length,
    averageOrderValue: sales.length ? Math.round(revenue / sales.length) : 0,
    previous: { revenue: sumRevenue(prevSales), orders: prevSales.length },
    byDay: [...byDayMap].map(([date, v]) => ({ date, ...v })),
    paymentSplit: split,
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    fulfilment: {
      toMake: count(["pending", "confirmed", "processing"]),
      shipped: count(["shipped"]),
      delivered: count(["delivered"]),
      cancelled: count(["cancelled"]),
    },
    refunded: orders.filter((o) => o.isRefunded).reduce((s, o) => s + (o.refundAmount || 0), 0),
  };
};

/** Sales for today / the last 7 days / the last 30 days (IST), with the period before for comparison */
export const salesReport = async (range = "7d", now = Date.now()) => {
  const days = RANGES[range] || RANGES["7d"];
  const from = istMidnight(now, days - 1);
  const prevFrom = new Date(from.getTime() - days * DAY_MS);
  const fields = "createdAt totalPrice paymentMethod status isRefunded refundStatus refundAmount items.name items.quantity items.price items.image";
  const placed = { awaitingPayment: { $ne: true } };
  const [orders, previous] = await Promise.all([
    Order.find({ ...placed, createdAt: { $gte: from, $lte: new Date(now) } }).select(fields).lean(),
    Order.find({ ...placed, createdAt: { $gte: prevFrom, $lt: from } }).select("createdAt totalPrice status isRefunded refundStatus").lean(),
  ]);
  return { range: RANGES[range] ? range : "7d", ...summarizeSales(orders, { from, to: new Date(now), previous, days }) };
};
