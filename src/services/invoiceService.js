import PDFDocument from "pdfkit";
import Order from "../models/Order.js";
import Counter from "../models/Counter.js";

/**
 * GST invoices. Seller details come from the environment:
 *   INVOICE_SELLER_NAME, INVOICE_SELLER_ADDRESS, INVOICE_SELLER_STATE,
 *   INVOICE_GSTIN (leave unset if not GST-registered: no tax is shown),
 *   INVOICE_GST_RATE (default 18), INVOICE_HSN (optional), INVOICE_PREFIX (default TRS),
 *   INVOICE_SELLER_EMAIL, INVOICE_SELLER_PHONE
 * Prices on the store include GST, so tax is worked back out of the total.
 */

const IST_OFFSET_MS = 330 * 60 * 1000;

export const sellerDetails = () => ({
  name: process.env.INVOICE_SELLER_NAME || "The Ribbon Story",
  address: process.env.INVOICE_SELLER_ADDRESS || "",
  state: process.env.INVOICE_SELLER_STATE || "",
  gstin: (process.env.INVOICE_GSTIN || "").trim().toUpperCase(),
  email: process.env.INVOICE_SELLER_EMAIL || "contact@theribbonstory.com",
  phone: process.env.INVOICE_SELLER_PHONE || "",
  hsn: process.env.INVOICE_HSN || "",
  rate: Number.isFinite(Number(process.env.INVOICE_GST_RATE)) && process.env.INVOICE_GST_RATE !== "" ? Number(process.env.INVOICE_GST_RATE) : 18,
  prefix: (process.env.INVOICE_PREFIX || "TRS").replace(/[^A-Za-z0-9-]/g, ""),
});

/** Indian financial year (April–March) of a date, e.g. "2026-27" */
export const financialYear = (date) => {
  const ist = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  const start = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};

/** Orders that can carry an invoice: placed (COD or paid online) */
const invoiceable = (order) => !order.awaitingPayment && (order.paymentMethod === "cod" || order.isPaid);

/**
 * Give a confirmed order the next invoice number of its financial year
 * (e.g. TRS/2026-27/0042). Safe to call more than once.
 */
export const assignInvoiceNumber = async (order) => {
  if (!order || order.invoice?.number || !invoiceable(order)) return order?.invoice || null;
  const date = new Date();
  const fy = financialYear(date);
  const { seq } = await Counter.findOneAndUpdate({ _id: `invoice-${fy}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  const invoice = { number: `${sellerDetails().prefix}/${fy}/${String(seq).padStart(4, "0")}`, date };
  const { modifiedCount } = await Order.updateOne(
    { _id: order._id, "invoice.number": { $exists: false } },
    { $set: { invoice } }
  );
  if (modifiedCount) {
    order.invoice = invoice;
    return invoice;
  }
  const fresh = await Order.findById(order._id).select("invoice");
  order.invoice = fresh?.invoice;
  return order.invoice;
};

/** Fire-and-forget wrapper for order confirmation paths */
export const issueInvoice = (order) =>
  assignInvoiceNumber(order).catch((err) => console.error(`[Invoice] Numbering ${order?._id} failed:`, err.message));

const round2 = (n) => Math.round(n * 100) / 100;
const sameState = (a, b) => Boolean(a && b) && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Tax split of a GST-inclusive total */
export const taxBreakup = (total, { rate, gstin, sellerState, buyerState }) => {
  if (!gstin || !rate) return { taxable: round2(total), cgst: 0, sgst: 0, igst: 0, intraState: true, rate: 0 };
  const taxable = round2((total * 100) / (100 + rate));
  const tax = round2(total - taxable);
  const intraState = sameState(sellerState, buyerState);
  if (!intraState) return { taxable, cgst: 0, sgst: 0, igst: tax, intraState, rate };
  const cgst = round2(tax / 2);
  return { taxable, cgst, sgst: round2(tax - cgst), igst: 0, intraState, rate };
};

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
const threeDigits = (n) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", twoDigits(n % 100)].filter(Boolean).join(" ");

/** Amount in words, Indian numbering: 125050.5 -> "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only" */
export const amountInWords = (amount) => {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  const parts = [];
  let n = rupees;
  for (const [size, name] of [[1e7, "Crore"], [1e5, "Lakh"], [1e3, "Thousand"]]) {
    if (n >= size) {
      parts.push(`${size === 1e7 ? amountInWords(Math.floor(n / size)).replace(/^Rupees | Only$/g, "") : twoDigits(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n) parts.push(threeDigits(n));
  const words = parts.join(" ") || "Zero";
  return `Rupees ${words}${paise ? ` and ${twoDigits(paise)} Paise` : ""} Only`;
};

const money = (n) => `Rs. ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** Everything printed on the invoice, worked out once (also used by the CSV export) */
export const invoiceData = (order) => {
  const seller = sellerDetails();
  const buyerState = order.shippingAddress?.state || "";
  const tax = taxBreakup(order.totalPrice || 0, { rate: seller.rate, gstin: seller.gstin, sellerState: seller.state, buyerState });
  return { seller, tax, buyerState };
};

/** Render the invoice PDF; resolves with a Buffer */
export const renderInvoicePdf = (order) =>
  new Promise((resolve, reject) => {
    const { seller, tax } = invoiceData(order);
    const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: `Invoice ${order.invoice?.number || ""}`, Author: seller.name } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ink = "#2B161B";
    const muted = "#7A6168";
    const accent = "#9E3D52";
    const left = 40;
    const right = 555;
    const width = right - left;

    // Header
    doc.fillColor(accent).font("Helvetica-Bold").fontSize(18).text(seller.gstin ? "TAX INVOICE" : "INVOICE", left, 40);
    doc.fillColor(ink).fontSize(12).text(seller.name, left, 66);
    doc.font("Helvetica").fontSize(9).fillColor(muted);
    const sellerLines = [seller.address, seller.state && `State: ${seller.state}`, seller.gstin ? `GSTIN: ${seller.gstin}` : "Not registered under GST", [seller.email, seller.phone].filter(Boolean).join(" · ")].filter(Boolean);
    doc.text(sellerLines.join("\n"), left, 82, { width: 280 });

    const metaX = 340;
    const meta = [
      ["Invoice no.", order.invoice?.number || "—"],
      ["Invoice date", fmtDate(order.invoice?.date || order.createdAt)],
      ["Order no.", `#${String(order._id).slice(-6).toUpperCase()}`],
      ["Order date", fmtDate(order.createdAt)],
      ["Payment", order.paymentMethod === "cod" ? "Cash on delivery" : `Paid online${order.paymentResult?.razorpayPaymentId ? ` (${order.paymentResult.razorpayPaymentId})` : ""}`],
    ];
    meta.forEach(([k, v], i) => {
      doc.font("Helvetica").fillColor(muted).fontSize(9).text(k, metaX, 44 + i * 15, { width: 70 });
      doc.font("Helvetica-Bold").fillColor(ink).text(v, metaX + 72, 44 + i * 15, { width: right - metaX - 72 });
    });

    // Bill to
    let y = Math.max(doc.y, 130) + 14;
    const a = order.shippingAddress || {};
    doc.moveTo(left, y).lineTo(right, y).strokeColor("#EBD3D8").lineWidth(1).stroke();
    y += 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(muted).text("BILL TO / SHIP TO", left, y);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(ink).text(a.name || order.user?.name || "Customer", left, y + 13);
    doc.font("Helvetica").fontSize(9).fillColor(ink).text(
      [[a.line1, a.line2].filter(Boolean).join(", "), [a.city, a.state, a.postalCode].filter(Boolean).join(", "), a.phone && `Phone: ${a.phone}`, order.user?.email].filter(Boolean).join("\n"),
      left,
      y + 27,
      { width: 300 }
    );
    const addressBottom = doc.y;
    if (seller.gstin) {
      doc.font("Helvetica").fillColor(muted).text(`Place of supply: ${a.state || "—"}`, metaX, y + 13, { width: right - metaX });
    }
    y = Math.max(addressBottom, doc.y) + 18;

    // Items
    const showHsn = Boolean(seller.gstin && seller.hsn);
    const cols = [
      { key: "n", label: "#", x: left, w: 20 },
      { key: "item", label: "Item", x: left + 22, w: showHsn ? 245 : 300 },
      ...(showHsn ? [{ key: "hsn", label: "HSN", x: left + 270, w: 50 }] : []),
      { key: "qty", label: "Qty", x: right - 215, w: 35, align: "right" },
      { key: "rate", label: "Rate", x: right - 175, w: 80, align: "right" },
      { key: "amount", label: "Amount", x: right - 90, w: 90, align: "right" },
    ];
    doc.rect(left, y, width, 20).fill("#FAF1F3");
    doc.font("Helvetica-Bold").fontSize(9).fillColor(ink);
    cols.forEach((c) => doc.text(c.label, c.x + 4, y + 6, { width: c.w - 8, align: c.align || "left" }));
    y += 26;

    const rows = (order.items || []).map((item, i) => {
      const options = (item.selectedOptions || []).map((o) => `${o.name}: ${o.value}`);
      const c = item.customization || {};
      const inscription = [c.customName, c.customDate].filter(Boolean).join(" · ");
      return {
        n: String(i + 1),
        item: item.name || "Item",
        detail: [...options, inscription && `Inscription: ${inscription}`].filter(Boolean).join(" | "),
        hsn: seller.hsn,
        qty: String(item.quantity),
        rate: money(item.price),
        amount: money(item.price * item.quantity),
      };
    });
    if (order.shippingPrice > 0) rows.push({ n: "", item: "Delivery charges", qty: "", rate: "", amount: money(order.shippingPrice), hsn: "" });
    if (order.discountPrice > 0) rows.push({ n: "", item: `Discount${order.couponCode ? ` (${order.couponCode})` : ""}`, qty: "", rate: "", amount: `- ${money(order.discountPrice)}`, hsn: "" });

    for (const row of rows) {
      if (y > 700) {
        doc.addPage();
        y = 40;
      }
      const top = y;
      let bottom = top + 12;
      doc.font("Helvetica").fontSize(9).fillColor(ink);
      cols.forEach((c) => {
        if (c.key === "item") {
          doc.font("Helvetica-Bold").text(row.item, c.x + 4, top, { width: c.w - 8 });
          if (row.detail) doc.font("Helvetica").fillColor(muted).fontSize(8).text(row.detail, c.x + 4, doc.y + 1, { width: c.w - 8 });
          doc.fontSize(9).fillColor(ink).font("Helvetica");
        } else {
          doc.text(row[c.key] || "", c.x + 4, top, { width: c.w - 8, align: c.align || "left" });
        }
        bottom = Math.max(bottom, doc.y);
      });
      y = bottom + 8;
      doc.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor("#F3E3E6").lineWidth(0.5).stroke();
    }

    // Totals
    y += 6;
    const totals = [];
    if (seller.gstin && tax.rate) {
      totals.push(["Taxable value", money(tax.taxable)]);
      if (tax.intraState) {
        totals.push([`CGST @ ${tax.rate / 2}%`, money(tax.cgst)], [`SGST @ ${tax.rate / 2}%`, money(tax.sgst)]);
      } else {
        totals.push([`IGST @ ${tax.rate}%`, money(tax.igst)]);
      }
    }
    totals.forEach(([k, v]) => {
      doc.font("Helvetica").fontSize(9).fillColor(muted).text(k, right - 260, y, { width: 160, align: "right" });
      doc.fillColor(ink).text(v, right - 95, y, { width: 95, align: "right" });
      y += 15;
    });
    doc.rect(right - 260, y, 260, 24).fill("#FAF1F3");
    doc.font("Helvetica-Bold").fontSize(11).fillColor(ink).text(seller.gstin ? "Total (incl. GST)" : "Total", right - 255, y + 7, { width: 155, align: "right" });
    doc.text(money(order.totalPrice), right - 95, y + 7, { width: 90, align: "right" });
    y += 32;
    doc.font("Helvetica").fontSize(9).fillColor(muted).text(amountInWords(order.totalPrice || 0), left, y, { width });
    y = doc.y + 8;
    if (order.status === "cancelled") {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#B42318").text("ORDER CANCELLED", left, y);
      y = doc.y + 6;
    }

    doc.font("Helvetica").fontSize(8).fillColor(muted).text(
      `${seller.gstin ? "Prices include GST. " : ""}This is a computer-generated invoice and needs no signature. Questions? ${seller.email}`,
      left,
      Math.max(y + 20, 770),
      { width, align: "center" }
    );
    doc.end();
  });
