import crypto from "crypto";
import User from "../models/User.js";
import { generateToken } from "../utils/generateToken.js";
import {
  sendForgotPasswordEmail,
  sendSetPasswordEmail,
  sendPasswordChangedConfirmationEmail,
  sendWelcomeEmail,
} from "../services/emailService.js";

export const register = async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ message: "An account with this email already exists" });

  const user = await User.create({ name, email, password });

  // Dispatch Welcome Email
  sendWelcomeEmail({ user }).catch((err) =>
    console.error("[AuthController] Error sending welcome email:", err)
  );

  return res.status(201).json({
    user: user.toSafeObject(),
    token: generateToken(user._id),
  });
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  return res.json({
    user: user.toSafeObject(),
    token: generateToken(user._id),
  });
};

export const googleAuth = async (req, res) => {
  let { credential, email, name, googleId, picture } = req.body;

  // Decode Google ID Token if passed as credential
  if (credential) {
    try {
      const parts = credential.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        email = payload.email || email;
        name = payload.name || name;
        googleId = payload.sub || googleId;
        picture = payload.picture || picture;
      }
    } catch (e) {
      console.warn("[AuthController] Could not decode Google credential token:", e.message);
    }
  }

  if (!email) {
    return res.status(400).json({ message: "Email is required for Google authentication" });
  }

  const cleanEmail = email.trim().toLowerCase();
  let user = await User.findOne({ email: cleanEmail });
  let isNewUser = false;

  if (!user) {
    // Generate secure random password for OAuth created account
    const randomPassword = crypto.randomBytes(16).toString("hex");
    user = await User.create({
      name: name?.trim() || cleanEmail.split("@")[0],
      email: cleanEmail,
      password: randomPassword,
      role: "customer",
    });
    isNewUser = true;

    // Send Welcome Email in background
    sendWelcomeEmail({ user }).catch((err) =>
      console.error("[AuthController] Error sending welcome email:", err)
    );
  } else if (name && (!user.name || user.name === cleanEmail.split("@")[0])) {
    user.name = name.trim();
    await user.save();
  }

  return res.status(isNewUser ? 201 : 200).json({
    user: user.toSafeObject(),
    token: generateToken(user._id),
    isNewUser,
    message: isNewUser
      ? "Account created with Google — welcome to The Ribbon Story!"
      : "Welcome back!",
  });
};

export const getMe = async (req, res) => {
  const user = await User.findById(req.user._id);
  return res.json({ user: user.toSafeObject() });
};

export const updateProfile = async (req, res) => {
  const { name, email, password } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (name) user.name = name;
  if (email) {
    const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
    if (existing) return res.status(409).json({ message: "Email already in use" });
    user.email = email.toLowerCase();
  }
  if (password) user.password = password;

  await user.save();
  return res.json({ user: user.toSafeObject(), message: "Profile updated successfully" });
};

export const addAddress = async (req, res) => {
  const user = await User.findById(req.user._id);
  user.addresses.push(req.body);
  await user.save();
  return res.status(201).json({ addresses: user.addresses, message: "Address added successfully" });
};

export const deleteAddress = async (req, res) => {
  const { addressId } = req.params;
  const user = await User.findById(req.user._id);
  user.addresses = user.addresses.filter((a) => String(a._id) !== String(addressId));
  await user.save();
  return res.json({ addresses: user.addresses, message: "Address deleted" });
};

/**
 * Request Forgot Password Email Link
 */
export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Please provide your registered email address" });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // For security reasons, respond with success message even if user not found
    return res.json({
      message: "If an account exists with this email, a password reset link has been dispatched.",
    });
  }

  // Generate 32-byte secure random token
  const resetToken = crypto.randomBytes(32).toString("hex");
  // Hash token before storing in database
  const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

  user.resetPasswordToken = tokenHash;
  user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity
  await user.save();

  // Send branded reset email via emailService
  await sendForgotPasswordEmail({ user, resetToken });

  return res.json({
    message: "Password reset link has been dispatched to your email address.",
  });
};

/**
 * Request Set Password Email Link (Welcome / Invitation)
 */
export const requestSetPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Please provide your registered email address" });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(404).json({ message: "No account found with this email" });
  }

  const setPasswordToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(setPasswordToken).digest("hex");

  user.resetPasswordToken = tokenHash;
  user.resetPasswordExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours validity
  await user.save();

  await sendSetPasswordEmail({ user, setPasswordToken });

  return res.json({
    message: "Password setup email has been dispatched.",
  });
};

/**
 * Reset Password using Token
 */
export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: "Token and new password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: tokenHash,
    resetPasswordExpires: { $gt: new Date() },
  }).select("+resetPasswordToken +resetPasswordExpires");

  if (!user) {
    return res.status(400).json({ message: "Password reset token is invalid or has expired" });
  }

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  // Send confirmation security notice
  await sendPasswordChangedConfirmationEmail({ user });

  return res.json({
    success: true,
    message: "Password has been updated successfully! You can now log in.",
    token: generateToken(user._id),
    user: user.toSafeObject(),
  });
};

