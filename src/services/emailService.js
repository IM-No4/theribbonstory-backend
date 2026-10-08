import nodemailer from "nodemailer";
import { escapeHtml as esc } from "../utils/security.js";
import dotenv from "dotenv";
import { absoluteImageUrl } from "../routes/seoRoutes.js";

dotenv.config();

/** Storefront base URL for links in emails (CLIENT_URL may list several origins) */
const storefrontUrl = () => (process.env.CLIENT_URL || "http://localhost:5173").split(",")[0].trim().replace(/\/$/, "");

// Senders Configuration
export const EMAIL_SENDERS = {
  NOREPLY: process.env.EMAIL_FROM_NOREPLY || '"The Ribbon Story" <no-reply@theribbonstory.com>',
  SUPPORT: process.env.EMAIL_FROM_SUPPORT || '"The Ribbon Story Support" <support@theribbonstory.com>',
  CONTACT: process.env.EMAIL_FROM_CONTACT || '"The Ribbon Story Inquiries" <contact@theribbonstory.com>',
};

// Multi-Sender Transporter Pool
const transporters = {};

export const getTransporter = (type = "NOREPLY") => {
  const upperType = (type || "NOREPLY").toUpperCase();
  if (transporters[upperType]) return transporters[upperType];

  const host = process.env.SMTP_HOST || "smtp.hostinger.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const isSecure = process.env.SMTP_SECURE === "true" || port === 465;

  const user = process.env[`SMTP_USER_${upperType}`] || process.env.SMTP_USER;
  const pass = process.env[`SMTP_PASS_${upperType}`] || process.env.SMTP_PASS;

  if (host && user && pass) {
    transporters[upperType] = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    });
  } else {
    // Development fallback mock transport
    transporters[upperType] = {
      sendMail: async (mailOptions) => {
        console.log(`\n================ [EMAIL SERVICE MOCK DISPATCH: ${upperType}] ================`);
        console.log(`From:    ${mailOptions.from}`);
        console.log(`To:      ${mailOptions.to}`);
        console.log(`Subject: ${mailOptions.subject}`);
        console.log("----------------------------------------------------------------");
        console.log(`Text preview: ${mailOptions.text ? mailOptions.text.slice(0, 200) : "HTML content only"}...`);
        console.log("================================================================\n");
        return { messageId: `mock_msg_${Date.now()}` };
      },
    };
  }

  return transporters[upperType];
};

/**
 * Luxury Branded Email Layout Wrapper
 */
const renderEmailTemplate = ({ title, preheader, content, actionButton }) => {
  const clientUrl = storefrontUrl();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FFFDF8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2B161B; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #FFFDF8; padding: 40px 0; }
    .main { background-color: #FFFFFF; margin: 0 auto; width: 100%; max-width: 600px; border-radius: 24px; border: 1px solid #F3D9DC; overflow: hidden; box-shadow: 0 10px 30px rgba(74, 31, 41, 0.06); }
    .header { background: linear-gradient(135deg, #4A1F29 0%, #2B161B 100%); padding: 36px 30px; text-align: center; }
    .logo-text { font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: bold; color: #FFFDF8; letter-spacing: 1px; margin: 0; }
    .tagline { color: #D68893; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin-top: 6px; font-weight: 600; }
    .content-body { padding: 36px 32px; font-size: 14px; line-height: 1.6; color: #3A2228; }
    .heading { font-family: 'Playfair Display', Georgia, serif; font-size: 22px; color: #4A1F29; font-weight: bold; margin-top: 0; margin-bottom: 16px; }
    .btn-container { text-align: center; margin: 30px 0; }
    .btn { display: inline-block; background-color: #4A1F29; color: #FFFFFF !important; font-size: 14px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px; letter-spacing: 0.5px; box-shadow: 0 4px 14px rgba(74, 31, 41, 0.25); }
    .footer { background-color: #FAF5F2; padding: 24px 30px; text-align: center; font-size: 12px; color: #8A6D74; border-top: 1px solid #F3D9DC; }
    .footer a { color: #D68893; text-decoration: none; font-weight: 600; }
    .divider { height: 1px; background-color: #F3D9DC; margin: 24px 0; }
    .badge { display: inline-block; background-color: #FDF2F4; color: #9E3D52; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #F3D9DC; }
  </style>
</head>
<body>
  <div style="display: none; font-size: 1px; color: #FFFDF8; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${esc(preheader || title)}
  </div>
  <center class="wrapper">
    <table class="main" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td class="header">
          <h1 class="logo-text">The Ribbon Story</h1>
          <div class="tagline">Bespoke 3D Keepsakes & Luxury Hampers</div>
        </td>
      </tr>
      <tr>
        <td class="content-body">
          ${content}
          ${
            actionButton
              ? `
          <div class="btn-container">
            <a href="${actionButton.url}" class="btn" target="_blank">${actionButton.text}</a>
          </div>
          `
              : ""
          }
        </td>
      </tr>
      <tr>
        <td class="footer">
          <p style="margin: 0 0 8px 0;">Need assistance with your handcrafted keepsake?</p>
          <p style="margin: 0 0 12px 0;">
            Email us at <a href="mailto:support@theribbonstory.com">support@theribbonstory.com</a> or message our Studio Concierge.
          </p>
          <p style="margin: 0; font-size: 11px; color: #A89096;">
            © ${new Date().getFullYear()} The Ribbon Story. All rights reserved. Handcrafted with love in India.
          </p>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
  `;
};

/**
 * 1. Order Confirmation Email (Sent on successful placement)
 */
/** The customer's approved 3D design, inscription and note for one order item */
const personalisationHtml = (item) => {
  const c = item.customization || {};
  const inscription = [c.customName, c.customDate].filter(Boolean).join(" · ");
  const note = c.note && c.note !== c.customName ? c.note : "";
  return [
    c.reference3D?.approvedPreview
      ? `<div style="margin-top: 8px;"><img src="${esc(absoluteImageUrl(c.reference3D.approvedPreview))}" alt="Your approved 3D design" width="96" height="96" style="border-radius: 10px; border: 1px solid #F3D9DC; background: #ffffff; object-fit: contain;"><div style="font-size: 11px; color: #166534; margin-top: 2px;">Your approved 3D design: this is what we'll craft</div></div>`
      : "",
    inscription ? `<div style="font-size: 11px; color: #4A1F29; margin-top: 2px;">Inscription: <strong>${esc(inscription)}</strong></div>` : "",
    note ? `<div style="font-size: 11px; color: #9E3D52; font-style: italic; margin-top: 2px;">"${esc(note)}"</div>` : "",
  ].join("");
};

export const sendOrderConfirmationEmail = async ({ order, userEmail, userName }) => {
  try {
    const mailClient = getTransporter("NOREPLY");
    const recipient = userEmail || order.shippingAddress?.email || order.user?.email;
    if (!recipient) return;

    const clientUrl = storefrontUrl();
    const shortOrderId = order._id.toString().slice(-6).toUpperCase();
    const recipientName = userName || order.shippingAddress?.name || order.user?.name || "Valued Patron";

    const itemsHtml = order.items
      .map(
        (item) => `
      <tr style="border-bottom: 1px solid #F3D9DC;">
        <td style="padding: 12px 0;">
          <strong style="color: #4A1F29; font-size: 14px;">${esc(item.name)}</strong>
          ${
            item.selectedOptions?.length
              ? `<div style="font-size: 11px; color: #8A6D74; margin-top: 2px;">${item.selectedOptions
                  .map((o) => `${esc(o.name)}: ${esc(o.value)}`)
                  .join(" | ")}</div>`
              : ""
          }
          ${personalisationHtml(item)}
        </td>
        <td style="padding: 12px 0; text-align: center; color: #664B52; font-size: 13px;">Qty: ${item.quantity}</td>
        <td style="padding: 12px 0; text-align: right; font-weight: bold; color: #4A1F29; font-size: 14px;">₹${item.price * item.quantity}</td>
      </tr>
    `
      )
      .join("");

    const content = `
      <div style="margin-bottom: 20px;">
        <span class="badge">Order Confirmed • #${shortOrderId}</span>
      </div>
      <h2 class="heading">Thank you for your order, ${esc(recipientName)}!</h2>
      <p>We are delighted to craft your bespoke keepsakes. Our artisans have received your order details and have queued your 3D casting and personalization.</p>
      
      <div style="background-color: #FAF5F2; border: 1px solid #F3D9DC; border-radius: 16px; padding: 20px; margin: 24px 0;">
        <h4 style="margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; color: #4A1F29; letter-spacing: 0.5px;">Order Summary</h4>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${itemsHtml}
          <tr>
            <td colspan="2" style="padding-top: 14px; text-align: right; color: #8A6D74; font-size: 13px;">Subtotal:</td>
            <td style="padding-top: 14px; text-align: right; font-weight: 600; color: #4A1F29;">₹${order.itemsPrice}</td>
          </tr>
          ${
            order.discountPrice > 0
              ? `
          <tr>
            <td colspan="2" style="padding-top: 6px; text-align: right; color: #166534; font-size: 13px;">Discount:</td>
            <td style="padding-top: 6px; text-align: right; font-weight: 600; color: #166534;">-₹${order.discountPrice}</td>
          </tr>
          `
              : ""
          }
          <tr>
            <td colspan="2" style="padding-top: 6px; text-align: right; color: #8A6D74; font-size: 13px;">Delivery:</td>
            <td style="padding-top: 6px; text-align: right; font-weight: 600; color: #4A1F29;">${order.shippingPrice === 0 ? "FREE" : `₹${order.shippingPrice}`}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding-top: 10px; text-align: right; font-size: 15px; font-weight: bold; color: #4A1F29;">Total Amount:</td>
            <td style="padding-top: 10px; text-align: right; font-size: 18px; font-weight: bold; color: #9E3D52;">₹${order.totalPrice}</td>
          </tr>
        </table>
      </div>

      <div style="background-color: #FFFFFF; border: 1px solid #F3D9DC; border-radius: 16px; padding: 18px; margin-bottom: 24px;">
        <h4 style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: #8A6D74; letter-spacing: 0.5px;">Delivery Destination & Slot</h4>
        <p style="margin: 0; color: #3A2228; font-size: 13px; line-height: 1.5;">
          <strong>${esc(order.shippingAddress?.name)}</strong><br>
          ${esc(order.shippingAddress?.line1)}${order.shippingAddress?.line2 ? `, ${esc(order.shippingAddress?.line2)}` : ""}<br>
          ${esc(order.shippingAddress?.city)}, ${esc(order.shippingAddress?.state)} - ${esc(order.shippingAddress?.postalCode)}<br>
          Phone: ${esc(order.shippingAddress?.phone)}
        </p>
        ${
          order.scheduledDeliveryDate
            ? `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #F3D9DC; font-size: 12px; color: #9E3D52; font-weight: 600;">
          📅 Scheduled Delivery: ${esc(order.scheduledDeliveryDate)} (${esc(order.deliverySlot || "Standard")})
        </div>
        `
            : ""
        }
      </div>
      
      <p style="font-size: 13px; color: #664B52;">You can follow your keepsake's journey live on our Shiprocket Radar tracker anytime.</p>
    `;

    const html = renderEmailTemplate({
      title: `Order Confirmed #${shortOrderId} - The Ribbon Story`,
      preheader: `Thank you for your order #${shortOrderId}! Your bespoke keepsakes are being handcrafted.`,
      content,
      actionButton: {
        text: "Track Your Keepsake Live",
        url: `${clientUrl}/track-order?id=${order._id}`,
      },
    });

    await mailClient.sendMail({
      from: EMAIL_SENDERS.NOREPLY,
      to: recipient,
      subject: `✨ Order Confirmed: #${shortOrderId} - The Ribbon Story`,
      html,
    });
  } catch (err) {
    console.error("[EmailService] Error sending order confirmation email:", err);
  }
};

/**
 * 2. Password Reset / Forgot Password Email
 */
export const sendForgotPasswordEmail = async ({ user, resetToken }) => {
  try {
    const mailClient = getTransporter("NOREPLY");
    const clientUrl = storefrontUrl();
    const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

    const content = `
      <div style="margin-bottom: 20px;">
        <span class="badge">Security & Authentication</span>
      </div>
      <h2 class="heading">Password Reset Request</h2>
      <p>Hello <strong>${esc(user.name || "there")}</strong>,</p>
      <p>We received a request to reset your password for your <strong>The Ribbon Story</strong> account associated with <code>${esc(user.email)}</code>.</p>
      <p>Click the secure button below to set a new password. This reset link is valid for <strong>1 hour</strong>.</p>
      
      <div style="background-color: #FAF5F2; border: 1px solid #F3D9DC; border-radius: 12px; padding: 14px; margin: 20px 0; font-size: 12px; color: #8A6D74;">
        🔒 If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </div>
    `;

    const html = renderEmailTemplate({
      title: "Reset Your Password - The Ribbon Story",
      preheader: "Reset your password for your The Ribbon Story account.",
      content,
      actionButton: {
        text: "Reset My Password",
        url: resetUrl,
      },
    });

    await mailClient.sendMail({
      from: EMAIL_SENDERS.NOREPLY,
      to: user.email,
      subject: "🔒 Reset Your Password - The Ribbon Story",
      html,
    });
  } catch (err) {
    console.error("[EmailService] Error sending forgot password email:", err);
  }
};

/**
 * 3. Set Password / Welcome Account Email
 */
export const sendSetPasswordEmail = async ({ user, setPasswordToken }) => {
  try {
    const mailClient = getTransporter("NOREPLY");
    const clientUrl = storefrontUrl();
    const setUrl = `${clientUrl}/reset-password?token=${setPasswordToken}&mode=set`;

    const content = `
      <div style="margin-bottom: 20px;">
        <span class="badge">Welcome to The Ribbon Story</span>
      </div>
      <h2 class="heading">Set Up Your Account Password</h2>
      <p>Hello <strong>${esc(user.name || "there")}</strong>,</p>
      <p>Welcome to <strong>The Ribbon Story</strong>! Your bespoke gifting account has been created.</p>
      <p>Please click the button below to set your secure password and access your orders, customized 3D photo gallery, and saved delivery addresses.</p>
    `;

    const html = renderEmailTemplate({
      title: "Set Your Password - The Ribbon Story",
      preheader: "Welcome to The Ribbon Story. Set your secure password to get started.",
      content,
      actionButton: {
        text: "Set My Password",
        url: setUrl,
      },
    });

    await mailClient.sendMail({
      from: EMAIL_SENDERS.NOREPLY,
      to: user.email,
      subject: "✨ Welcome to The Ribbon Story - Set Up Your Password",
      html,
    });
  } catch (err) {
    console.error("[EmailService] Error sending set password email:", err);
  }
};

/**
 * 4. Password Successfully Changed Confirmation
 */
export const sendPasswordChangedConfirmationEmail = async ({ user }) => {
  try {
    const mailClient = getTransporter("SUPPORT");
    const content = `
      <div style="margin-bottom: 20px;">
        <span class="badge">Security Alert</span>
      </div>
      <h2 class="heading">Your Password Was Updated</h2>
      <p>Hello <strong>${esc(user.name || "there")}</strong>,</p>
      <p>This is a confirmation that the password for your account <code>${esc(user.email)}</code> was successfully updated on <strong>${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</strong>.</p>
      <p>If you made this change, no further action is required.</p>
      <div style="background-color: #FDF2F4; border: 1px solid #F3D9DC; border-radius: 12px; padding: 14px; margin: 20px 0; font-size: 12px; color: #9E3D52;">
        ⚠️ If you did not make this change, please contact our support team immediately at <a href="mailto:support@theribbonstory.com" style="color: #9E3D52; font-weight: bold;">support@theribbonstory.com</a>.
      </div>
    `;

    const html = renderEmailTemplate({
      title: "Security Notice: Password Updated - The Ribbon Story",
      preheader: "Your The Ribbon Story account password was recently changed.",
      content,
    });

    await mailClient.sendMail({
      from: EMAIL_SENDERS.SUPPORT,
      to: user.email,
      subject: "🔒 Security Alert: Your Password Has Been Updated",
      html,
    });
  } catch (err) {
    console.error("[EmailService] Error sending password changed email:", err);
  }
};

/**
 * 5. Refund Notification Email
 */
export const sendRefundNotificationEmail = async ({ order, userEmail, refundAmount, refundId, reason }) => {
  try {
    const mailClient = getTransporter("SUPPORT");
    const recipient = userEmail || order.shippingAddress?.email || order.user?.email;
    if (!recipient) return;

    const shortOrderId = order._id.toString().slice(-6).toUpperCase();
    const amt = refundAmount || order.refundAmount || order.totalPrice;

    const content = `
      <div style="margin-bottom: 20px;">
        <span class="badge">Refund Processed</span>
      </div>
      <h2 class="heading">Refund of ₹${amt} Initiated</h2>
      <p>Hello,</p>
      <p>We have processed a refund of <strong>₹${amt}</strong> for your order <strong>#${shortOrderId}</strong>.</p>
      
      <div style="background-color: #FAF5F2; border: 1px solid #F3D9DC; border-radius: 16px; padding: 18px; margin: 20px 0; font-size: 13px;">
        <p style="margin: 0 0 6px 0;"><strong>Refund Reference ID:</strong> <code style="font-family: monospace; color: #4A1F29;">${refundId || order.refundId || "rfnd_processed"}</code></p>
        <p style="margin: 0 0 6px 0;"><strong>Reason:</strong> ${esc(reason || order.refundReason || "Customer cancellation / adjustment")}</p>
        <p style="margin: 0;"><strong>Payment Method:</strong> ${order.paymentMethod === "razorpay" ? "Razorpay Gateway (UPI / Card / NetBanking)" : "Store / Bank Transfer"}</p>
      </div>

      <p style="font-size: 13px; color: #664B52;">
        Depending on your banking partner or UPI provider, the credited amount will appear in your bank account statement within 5 to 7 working days.
      </p>
    `;

    const html = renderEmailTemplate({
      title: `Refund Processed for Order #${shortOrderId} - The Ribbon Story`,
      preheader: `Refund of ₹${amt} has been processed for order #${shortOrderId}.`,
      content,
    });

    await mailClient.sendMail({
      from: EMAIL_SENDERS.SUPPORT,
      to: recipient,
      subject: `💸 Refund Processed: Order #${shortOrderId} (₹${amt}) - The Ribbon Story`,
      html,
    });
  } catch (err) {
    console.error("[EmailService] Error sending refund notification email:", err);
  }
};

/**
 * 6. Contact Form / Inquiries Inbound & Auto-Reply Email
 */
export const sendContactInquiryEmails = async ({ name, email, phone, subject, message }) => {
  try {
    const mailClient = getTransporter("CONTACT");

    // 1. Notify internal team at contact@theribbonstory.com
    await mailClient.sendMail({
      from: EMAIL_SENDERS.NOREPLY,
      to: "contact@theribbonstory.com",
      replyTo: email,
      subject: `📬 New Customer Inquiry: ${subject || "General Message"} from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || "N/A"}\n\nMessage:\n${message}`,
      html: `
        <div style="font-family: sans-serif; font-size: 14px; color: #333;">
          <h3 style="color: #4A1F29;">New Website Inquiry</h3>
          <p><strong>Name:</strong> ${esc(name)}</p>
          <p><strong>Email:</strong> ${esc(email)}</p>
          <p><strong>Phone:</strong> ${esc(phone || "Not provided")}</p>
          <p><strong>Subject:</strong> ${esc(subject || "General Inquiry")}</p>
          <div style="background: #f7f7f7; padding: 15px; border-radius: 8px; margin-top: 10px;">
            ${esc(message).replace(/\n/g, "<br>")}
          </div>
        </div>
      `,
    });

    // 2. Send polite acknowledgment to customer from contact@theribbonstory.com
    const ackContent = `
      <h2 class="heading">We Received Your Message!</h2>
      <p>Hello <strong>${esc(name)}</strong>,</p>
      <p>Thank you for getting in touch with <strong>The Ribbon Story</strong>. Our studio concierge team has received your message regarding <em>"${esc(subject || "Your Inquiry")}"</em> and will reply within 2 to 4 business hours.</p>
      <div style="background-color: #FAF5F2; border: 1px solid #F3D9DC; border-radius: 12px; padding: 14px; margin: 20px 0; font-size: 12px; color: #8A6D74;">
        <strong>Your Message:</strong><br>
        "${esc(message)}"
      </div>
    `;

    const ackHtml = renderEmailTemplate({
      title: "We Received Your Message - The Ribbon Story",
      preheader: "Thank you for contacting The Ribbon Story. We will get back to you shortly.",
      content: ackContent,
    });

    await mailClient.sendMail({
      from: EMAIL_SENDERS.CONTACT,
      to: email,
      subject: `✨ We Received Your Inquiry - The Ribbon Story`,
      html: ackHtml,
    });
  } catch (err) {
    console.error("[EmailService] Error sending contact inquiry email:", err);
  }
};

/**
 * 7. Order Shipped Email
 */
export const sendOrderShippedEmail = async ({ order, userEmail, userName }) => {
  try {
    const mailClient = getTransporter("NOREPLY");
    const recipient = userEmail || order.user?.email;
    if (!recipient) return;

    const clientUrl = storefrontUrl();
    const shortOrderId = order._id.toString().slice(-6).toUpperCase();
    // Only show tracking details that really exist (no placeholder courier)
    const awb = order.awbCode || order.trackingNumber || "";
    const courier = awb ? order.courierName || order.courierPartner || "" : "";

    const content = `
      <div style="margin-bottom: 20px;">
        <span class="badge" style="background-color: #EEF2FF; color: #4338CA; border-color: #C7D2FE;">On Its Way • #${shortOrderId}</span>
      </div>
      <h2 class="heading">Your Keepsake Has Been Shipped! 🚚</h2>
      <p>Hello <strong>${esc(userName || order.shippingAddress?.name || "there")}</strong>,</p>
      <p>Great news! Your order <strong>#${shortOrderId}</strong> has passed our studio's final checks and is on its way to you.</p>

      <div style="background-color: #FAF5F2; border: 1px solid #F3D9DC; border-radius: 16px; padding: 18px; margin: 20px 0; font-size: 13px;">
        ${courier ? `<p style="margin: 0 0 6px 0;"><strong>Courier:</strong> ${esc(courier)}</p>` : ""}
        ${awb ? `<p style="margin: 0 0 6px 0;"><strong>Tracking number:</strong> <code style="font-family: monospace; color: #4A1F29; font-weight: bold;">${esc(awb)}</code></p>` : ""}
        ${order.estimatedDelivery ? `<p style="margin: 0 0 6px 0;"><strong>Expected by:</strong> ${esc(new Date(order.estimatedDelivery).toLocaleDateString("en-IN", { day: "numeric", month: "long" }))}</p>` : ""}
        <p style="margin: 0;"><strong>Delivering to:</strong> ${esc([order.shippingAddress?.city, order.shippingAddress?.state].filter(Boolean).join(", "))} (${esc(order.shippingAddress?.postalCode)})</p>
      </div>

      <p style="font-size: 13px; color: #664B52;">Follow your parcel any time with the button below.</p>
    `;

    const html = renderEmailTemplate({
      title: `Order Shipped: #${shortOrderId} - The Ribbon Story`,
      preheader: `Your order #${shortOrderId} from The Ribbon Story is on its way!`,
      content,
      actionButton: {
        text: "Track Your Order",
        url: `${clientUrl}/track-order?id=${order._id}`,
      },
    });

    await mailClient.sendMail({
      from: EMAIL_SENDERS.NOREPLY,
      to: recipient,
      subject: `🚚 Your order #${shortOrderId} has been shipped!`,
      html,
    });
    return true;
  } catch (err) {
    console.error("[EmailService] Error sending order shipped email:", err);
    return false;
  }
};

/**
 * 8. Order Delivered Email, with a link to review what they received
 */
export const sendOrderDeliveredEmail = async ({ order, userEmail, userName, reviewPath = "/account" }) => {
  try {
    const mailClient = getTransporter("NOREPLY");
    const recipient = userEmail || order.user?.email;
    if (!recipient) return;

    const clientUrl = storefrontUrl();
    const shortOrderId = order._id.toString().slice(-6).toUpperCase();

    const content = `
      <div style="margin-bottom: 20px;">
        <span class="badge" style="background-color: #F0FDF4; color: #166534; border-color: #BBF7D0;">Delivered • #${shortOrderId}</span>
      </div>
      <h2 class="heading">Your Keepsake Has Arrived! 🎁</h2>
      <p>Hello <strong>${esc(userName || order.shippingAddress?.name || "there")}</strong>,</p>
      <p>Your order <strong>#${shortOrderId}</strong> has been delivered. We hope opening it brings as much joy as we had making it!</p>

      <div style="text-align: center; margin: 26px 0; padding: 20px; background-color: #FAF5F2; border-radius: 16px; border: 1px solid #F3D9DC;">
        <p style="margin: 0 0 10px 0; font-size: 13px; font-weight: bold; color: #4A1F29;">Loved it? Tell others in a quick review</p>
        <a href="${clientUrl}${reviewPath}" style="text-decoration: none; color: #EAB308; font-size: 30px; letter-spacing: 10px;">★★★★★</a>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #8A6D74;">An unboxing photo helps other gift-givers most.</p>
      </div>

      <p style="font-size: 13px; color: #664B52;">Something not right? Just reply to this email and our studio will make it right.</p>
    `;

    const html = renderEmailTemplate({
      title: `Delivered: #${shortOrderId} - The Ribbon Story`,
      preheader: `Your order #${shortOrderId} has been delivered. How did we do?`,
      content,
      actionButton: { text: "Leave a Review", url: `${clientUrl}${reviewPath}` },
    });

    await mailClient.sendMail({
      from: EMAIL_SENDERS.NOREPLY,
      replyTo: EMAIL_SENDERS.SUPPORT,
      to: recipient,
      subject: `🎁 Delivered: your order #${shortOrderId} has arrived!`,
      html,
    });
    return true;
  } catch (err) {
    console.error("[EmailService] Error sending order delivered email:", err);
    return false;
  }
};

/**
 * 10. Welcome New User Registration Email
 */
export const sendWelcomeEmail = async ({ user }) => {
  try {
    const mailClient = getTransporter("NOREPLY");
    const clientUrl = storefrontUrl();

    const content = `
      <div style="margin-bottom: 20px;">
        <span class="badge">Welcome to The Ribbon Story</span>
      </div>
      <h2 class="heading">Welcome to the Family, ${esc(user.name || "Friend")}! ✨</h2>
      <p>We are delighted to welcome you to <strong>The Ribbon Story</strong> — India's premier bespoke 3D keepsakes and handcrafted memory gifting destination.</p>
      
      <div style="background-color: #FAF5F2; border: 1px solid #F3D9DC; border-radius: 16px; padding: 20px; margin: 24px 0;">
        <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #4A1F29; text-transform: uppercase;">What you can do with your account:</h4>
        <ul style="margin: 0; padding-left: 20px; color: #3A2228; font-size: 13px; line-height: 1.7;">
          <li>Upload photos and instantly preview authentic 3D miniature figurines</li>
          <li>Save multiple delivery addresses for seamless 1-click checkout</li>
          <li>Track all your bespoke gift orders and live Shiprocket delivery scans</li>
          <li>Access exclusive celebration discounts and seasonal hampers</li>
        </ul>
      </div>

      <p style="font-size: 13px; color: #664B52;">
        Ready to turn a cherished memory into a timeless physical sculpture?
      </p>
    `;

    const html = renderEmailTemplate({
      title: "Welcome to The Ribbon Story",
      preheader: "Welcome to The Ribbon Story! Start crafting your personalized 3D keepsakes.",
      content,
      actionButton: {
        text: "Explore 3D Keepsakes Collection",
        url: `${clientUrl}/shop`,
      },
    });

    await mailClient.sendMail({
      from: EMAIL_SENDERS.NOREPLY,
      to: user.email,
      subject: "✨ Welcome to The Ribbon Story - Handcrafted Bespoke Keepsakes",
      html,
    });
  } catch (err) {
    console.error("[EmailService] Error sending welcome email:", err);
  }
};

/**
 * 11. Coming Soon VIP Waitlist Acknowledgment Email
 */
export const sendLaunchWaitlistEmail = async ({ email }) => {
  try {
    const mailClient = getTransporter("CONTACT");

    const content = `
      <div style="margin-bottom: 20px;">
        <span class="badge">VIP Early Access • Launch List</span>
      </div>
      <h2 class="heading">You're on the VIP Launch List! 🎀</h2>
      <p>Hello,</p>
      <p>Thank you for joining <strong>The Ribbon Story</strong> early access community. We are currently putting the final touches on our bespoke 3D keepsake studio.</p>
      
      <div style="background-color: #FAF5F2; border: 1px solid #F3D9DC; border-radius: 16px; padding: 20px; margin: 24px 0; font-size: 13px; line-height: 1.6; color: #4A1F29;">
        <p style="margin: 0 0 10px 0; font-weight: bold; font-family: 'Playfair Display', Georgia, serif; font-size: 16px;">
          "Your memories deserve to be kept."
        </p>
        <p style="margin: 0; color: #664B52;">
          As an early subscriber, you will receive priority access when our store officially opens, along with an exclusive launch gift voucher reserved for our founding patrons.
        </p>
      </div>

      <p style="font-size: 13px; color: #664B52;">
        Follow our journey and sneak peeks on Instagram: <a href="https://instagram.com/theribbonstory_official" target="_blank" style="color: #9E3D52; font-weight: 600;">@theribbonstory_official</a>
      </p>
    `;

    const html = renderEmailTemplate({
      title: "You're on the VIP Launch List - The Ribbon Story",
      preheader: "Thank you for joining The Ribbon Story early access waitlist.",
      content,
    });

    // 1. Send confirmation to subscriber
    await mailClient.sendMail({
      from: EMAIL_SENDERS.NOREPLY,
      to: email,
      subject: "🎀 You're on the VIP Launch List! - The Ribbon Story",
      html,
    });

    // 2. Notify admin of new lead
    await mailClient.sendMail({
      from: EMAIL_SENDERS.NOREPLY,
      to: "contact@theribbonstory.com",
      subject: `✨ New VIP Waitlist Lead: ${email}`,
      text: `New subscriber joined the Coming Soon waitlist:\n\nEmail: ${email}\nTime: ${new Date().toISOString()}`,
    });
  } catch (err) {
    console.error("[EmailService] Error sending launch waitlist email:", err);
  }
};


