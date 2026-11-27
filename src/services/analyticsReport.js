import AnalyticsEvent from "../models/AnalyticsEvent.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { isObjectId } from "../utils/security.js";

export const RANGE_DAYS = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
const TIMEZONE = "+05:30"; // India: days start at midnight IST
const OFFSET_MS = 5.5 * 3600 * 1000;
const DAY_MS = 86400000;

/** Current window and the equally long one before it */
export const reportWindow = (range, now = new Date()) => {
  const days = RANGE_DAYS[range] || RANGE_DAYS["7d"];
  const startOfToday = Math.floor((now.getTime() + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS;
  const from = new Date(startOfToday - (days - 1) * DAY_MS);
  const span = days * DAY_MS;
  return { days, from, to: now, previousFrom: new Date(from.getTime() - span), previousTo: new Date(now.getTime() - span) };
};

const between = (from, to) => ({ createdAt: { $gte: from, $lte: to } });
const flag = (type) => ({ $max: { $cond: [{ $eq: ["$type", type] }, 1, 0] } });
const countOf = (type) => ({ $sum: { $cond: [{ $eq: ["$type", type] }, 1, 0] } });
const run = (model, pipeline) => model.aggregate(pipeline).allowDiskUse(true);

// One row per visit, with what happened in it
const sessionStage = {
  $group: {
    _id: "$sessionId",
    visitorId: { $first: "$visitorId" },
    source: { $first: "$source" },
    medium: { $first: "$medium" },
    campaign: { $first: "$campaign" },
    device: { $first: "$device" },
    pageViews: countOf("page_view"),
    clicks: countOf("click"),
    productViews: countOf("product_view"),
    addToCarts: countOf("add_to_cart"),
    checkouts: countOf("begin_checkout"),
    viewed: flag("product_view"),
    added: flag("add_to_cart"),
    checkout: flag("begin_checkout"),
    bought: flag("purchase"),
    purchases: countOf("purchase"),
    revenue: { $sum: { $cond: [{ $eq: ["$type", "purchase"] }, "$value", 0] } },
  },
};

const sum = (field) => ({ $sum: `$${field}` });
const sessionTotals = {
  visits: { $sum: 1 },
  pageViews: sum("pageViews"),
  clicks: sum("clicks"),
  productViews: sum("productViews"),
  addToCarts: sum("addToCarts"),
  checkouts: sum("checkouts"),
  viewedVisits: sum("viewed"),
  addedVisits: sum("added"),
  checkoutVisits: sum("checkout"),
  boughtVisits: sum("bought"),
};
const EMPTY_TOTALS = Object.fromEntries(Object.keys(sessionTotals).map((k) => [k, 0]));

// Real sales come from the orders themselves, so ad blockers can't hide any
const soldFilter = (from, to) => ({
  ...between(from, to),
  status: { $ne: "cancelled" },
  $or: [{ isPaid: true }, { paymentMethod: "cod" }],
});

const periodTotals = async (from, to) => {
  const [events, visitors, orders] = await Promise.all([
    run(AnalyticsEvent, [{ $match: between(from, to) }, sessionStage, { $group: { _id: null, ...sessionTotals } }]),
    run(AnalyticsEvent, [{ $match: between(from, to) }, { $group: { _id: "$visitorId" } }, { $count: "n" }]),
    run(Order, [
      { $match: soldFilter(from, to) },
      { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: "$totalPrice" } } },
    ]),
  ]);
  const { _id, ...totals } = events[0] || EMPTY_TOTALS;
  return {
    ...EMPTY_TOTALS,
    ...totals,
    visitors: visitors[0]?.n || 0,
    orders: orders[0]?.orders || 0,
    revenue: orders[0]?.revenue || 0,
  };
};

const dayOf = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TIMEZONE } };

const topBy = (match, groupId, limit = 15) =>
  run(AnalyticsEvent, [
    { $match: match },
    { $group: { _id: groupId, count: { $sum: 1 }, visitors: { $addToSet: "$visitorId" } } },
    { $project: { count: 1, visitors: { $size: "$visitors" } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

export const buildReport = async (range) => {
  const window = reportWindow(range);
  const { from, to } = window;
  const inRange = between(from, to);

  const [totals, previous, daily, sources, devices, productEvents, sold, pages, clicks, searches, live] = await Promise.all([
    periodTotals(from, to),
    periodTotals(window.previousFrom, window.previousTo),
    run(AnalyticsEvent, [
      { $match: inRange },
      {
        $group: {
          _id: { day: dayOf, session: "$sessionId" },
          visitorId: { $first: "$visitorId" },
          pageViews: countOf("page_view"),
          added: flag("add_to_cart"),
          bought: flag("purchase"),
        },
      },
      {
        $group: {
          _id: "$_id.day",
          visits: { $sum: 1 },
          visitors: { $addToSet: "$visitorId" },
          pageViews: sum("pageViews"),
          addedVisits: sum("added"),
          boughtVisits: sum("bought"),
        },
      },
      { $project: { visits: 1, pageViews: 1, addedVisits: 1, boughtVisits: 1, visitors: { $size: "$visitors" } } },
      { $sort: { _id: 1 } },
    ]),
    run(AnalyticsEvent, [
      { $match: inRange },
      sessionStage,
      {
        $group: {
          _id: { source: "$source", medium: "$medium", campaign: "$campaign" },
          ...sessionTotals,
          visitors: { $addToSet: "$visitorId" },
          orders: sum("purchases"),
          revenue: sum("revenue"),
        },
      },
      { $addFields: { visitors: { $size: "$visitors" } } },
      { $sort: { visits: -1 } },
      { $limit: 30 },
    ]),
    run(AnalyticsEvent, [
      { $match: inRange },
      sessionStage,
      { $group: { _id: "$device", visits: { $sum: 1 }, boughtVisits: sum("bought") } },
      { $sort: { visits: -1 } },
    ]),
    run(AnalyticsEvent, [
      { $match: { ...inRange, type: { $in: ["product_view", "add_to_cart"] }, productId: { $exists: true } } },
      {
        $group: {
          _id: "$productId",
          name: { $last: "$productName" },
          views: countOf("product_view"),
          viewers: { $addToSet: { $cond: [{ $eq: ["$type", "product_view"] }, "$visitorId", null] } },
          adders: { $addToSet: { $cond: [{ $eq: ["$type", "add_to_cart"] }, "$visitorId", null] } },
          unitsAdded: { $sum: { $cond: [{ $eq: ["$type", "add_to_cart"] }, { $ifNull: ["$quantity", 1] }, 0] } },
        },
      },
      {
        $project: {
          name: 1,
          views: 1,
          unitsAdded: 1,
          viewers: { $size: { $setDifference: ["$viewers", [null]] } },
          adders: { $size: { $setDifference: ["$adders", [null]] } },
        },
      },
      { $sort: { views: -1, unitsAdded: -1 } },
      { $limit: 50 },
    ]),
    run(Order, [
      { $match: soldFilter(from, to) },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          unitsSold: { $sum: "$items.quantity" },
          sales: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
    ]),
    topBy({ ...inRange, type: "page_view" }, "$path"),
    topBy({ ...inRange, type: "click" }, { label: "$label", path: "$path" }, 25),
    topBy({ ...inRange, type: "search" }, { $toLower: "$label" }),
    run(AnalyticsEvent, [
      { $match: { createdAt: { $gte: new Date(to.getTime() - 5 * 60 * 1000) } } },
      { $group: { _id: "$visitorId" } },
      { $count: "n" },
    ]),
  ]);

  // Current product names, plus units sold from real orders
  const ids = productEvents.map((p) => p._id).filter((id) => isObjectId(String(id)));
  const names = new Map(
    (await Product.find({ _id: { $in: ids } }).select("name")).map((p) => [String(p._id), p.name])
  );
  const soldById = new Map(sold.map((s) => [String(s._id), s]));
  const products = productEvents.map((p) => ({
    id: p._id,
    name: names.get(String(p._id)) || p.name || "Unknown product",
    views: p.views,
    viewers: p.viewers,
    adders: p.adders,
    unitsAdded: p.unitsAdded,
    unitsSold: soldById.get(String(p._id))?.unitsSold || 0,
    sales: soldById.get(String(p._id))?.sales || 0,
  }));

  return {
    range: range in RANGE_DAYS ? range : "7d",
    from,
    to,
    liveVisitors: live[0]?.n || 0,
    totals,
    previous,
    daily: daily.map(({ _id, ...d }) => ({ day: _id, ...d })),
    sources: sources.map(({ _id, ...s }) => ({ ..._id, ...s })),
    devices: devices.map(({ _id, ...d }) => ({ device: _id, ...d })),
    products,
    pages: pages.map((p) => ({ path: p._id, views: p.count, visitors: p.visitors })),
    clicks: clicks.map((c) => ({ label: c._id.label, path: c._id.path, clicks: c.count, visitors: c.visitors })),
    searches: searches.map((s) => ({ term: s._id, searches: s.count, visitors: s.visitors })),
  };
};
