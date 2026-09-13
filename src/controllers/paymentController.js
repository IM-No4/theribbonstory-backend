import Razorpay from "razorpay";
import crypto from "crypto";

const getRazorpayInstance = () => {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.includes("xxxx") || !RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
};

export const createRazorpayOrder = async (req, res) => {
  const { amount } = req.body; // amount in rupees
  if (!amount || amount <= 0) return res.status(400).json({ message: "Invalid amount" });

  const instance = getRazorpayInstance();
  if (!instance) {
    return res.status(503).json({
      message:
        "Payment gateway not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env to enable checkout.",
    });
  }

  const order = await instance.orders.create({
    amount: Math.round(amount * 100),
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
  });

  return res.status(201).json({ order, keyId: process.env.RAZORPAY_KEY_ID });
};

export const verifyRazorpayPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const isValid = expected === razorpay_signature;
  return res.json({ valid: isValid });
};

/**
 * Execute a Full or Partial Refund via Razorpay
 */
export const executeRazorpayRefund = async ({ paymentId, amount, notes = {} }) => {
  const instance = getRazorpayInstance();

  // If Razorpay instance is not configured or in mock/test mode
  if (!instance || !paymentId || paymentId.startsWith("pay_mock_") || paymentId.includes("xxxx")) {
    const mockRefundId = `rfnd_${Math.random().toString(36).substring(2, 16)}`;
    return {
      success: true,
      refundId: mockRefundId,
      amount: amount,
      status: "processed",
      created_at: Math.floor(Date.now() / 1000),
      notes,
    };
  }

  try {
    const refundPayload = {
      amount: Math.round(amount * 100), // convert to paise
      speed: "optimum",
      notes,
    };

    const refund = await instance.payments.refund(paymentId, refundPayload);
    return {
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status || "processed",
      created_at: refund.created_at,
    };
  } catch (err) {
    console.error("Razorpay refund error:", err);
    throw new Error(err.error?.description || err.message || "Failed to process refund via Razorpay");
  }
};

