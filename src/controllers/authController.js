import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import { setAuthCookie, clearAuthCookie } from "../utils/authCookie.js";
import {
  sendForgotPasswordEmail,
  sendSetPasswordEmail,
  sendPasswordChangedConfirmationEmail,
  sendWelcomeEmail,
} from "../services/emailService.js";

export const register = async (req, res) => {
  const { name, email, password } = req.body;
  if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string" || !name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ message: "An account with this email already exists" });

  const user = await User.create({ name, email, password });

  // Dispatch Welcome Email
  sendWelcomeEmail({ user }).catch((err) =>
    console.error("[AuthController] Error sending welcome email:", err)
  );

  setAuthCookie(res, user);
  return res.status(201).json({
    user: user.toSafeObject(),
  });
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  setAuthCookie(res, user);
  return res.json({
    user: user.toSafeObject(),
  });
};

const googleClient = new OAuth2Client();

const getGoogleClientIds = () =>
  (process.env.GOOGLE_CLIENT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Resolve a verified Google profile from either a GIS ID token (credential)
 * or an OAuth access token. Never trusts client-supplied email/name fields.
 */
const getVerifiedGoogleProfile = async ({ credential, accessToken }) => {
  const audience = getGoogleClientIds();
  if (audience.length === 0) {
    const err = new Error("Google sign-in is not configured on the server (GOOGLE_CLIENT_ID missing)");
    err.statusCode = 503;
    throw err;
  }

  if (typeof credential === "string" && credential) {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience });
    const payload = ticket.getPayload();
    return { email: payload.email, emailVerified: payload.email_verified, name: payload.name, googleId: payload.sub };
  }

  if (typeof accessToken === "string" && accessToken) {
    const info = await googleClient.getTokenInfo(accessToken);
    if (!audience.includes(info.aud) && !audience.includes(info.azp)) {
      throw new Error("Google token was not issued for this application");
    }
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) throw new Error("Could not fetch Google profile");
    const profile = await profileRes.json();
    if (profile.sub !== info.sub) throw new Error("Google profile mismatch");
    return { email: profile.email, emailVerified: profile.email_verified, name: profile.name, googleId: profile.sub };
  }

  return null;
};

export const googleAuth = async (req, res) => {
  let profile;
  try {
    profile = await getVerifiedGoogleProfile(req.body || {});
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ message: e.message });
    console.warn("[AuthController] Google token verification failed:", e.message);
    return res.status(401).json({ message: "Google sign-in could not be verified. Please try again." });
  }

  if (!profile) {
    return res.status(400).json({ message: "A Google credential is required" });
  }
  if (!profile.email || !profile.emailVerified) {
    return res.status(401).json({ message: "Your Google account email is not verified" });
  }

  const cleanEmail = profile.email.trim().toLowerCase();
  const name = profile.name;
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

  setAuthCookie(res, user);
  return res.status(isNewUser ? 201 : 200).json({
    user: user.toSafeObject(),
    isNewUser,
    message: isNewUser
      ? "Account created with Google — welcome to The Ribbon Story!"
      : "Welcome back!",
  });
};

export const logout = async (req, res) => {
  clearAuthCookie(res);
  return res.json({ message: "Logged out" });
};

export const getMe = async (req, res) => {
  const user = await User.findById(req.user._id);
  return res.json({ user: user.toSafeObject() });
};

export const updateProfile = async (req, res) => {
  const { name, email, password, currentPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const newEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const changingEmail = newEmail && newEmail !== user.email;
  const changingPassword = typeof password === "string" && password.length > 0;

  if (changingEmail || changingPassword) {
    if (typeof currentPassword !== "string" || !(await user.comparePassword(currentPassword))) {
      // 400 rather than 401: the session is valid, only the confirmation failed
      return res.status(400).json({
        message: "Please enter your current password to change your email or password",
      });
    }
  }
  if (changingPassword && password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }

  if (typeof name === "string" && name.trim()) user.name = name.trim();
  if (changingEmail) {
    const existing = await User.findOne({ email: newEmail, _id: { $ne: user._id } });
    if (existing) return res.status(409).json({ message: "Email already in use" });
    user.email = newEmail;
  }
  if (changingPassword) user.password = password;

  await user.save();
  // Credential changes sign out every other device; re-issue this device's session
  if (changingEmail || changingPassword) setAuthCookie(res, user);
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
  if (typeof email !== "string" || !email) {
    return res.status(400).json({ message: "Please provide your registered email address" });
  }

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
    message: "If an account exists with this email, a password reset link has been dispatched.",
  });
};

/**
 * Request Set Password Email Link (Welcome / Invitation)
 */
export const requestSetPassword = async (req, res) => {
  const { email } = req.body;
  if (typeof email !== "string" || !email) {
    return res.status(400).json({ message: "Please provide your registered email address" });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.json({ message: "If an account exists with this email, a password setup link has been dispatched." });
  }

  const setPasswordToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(setPasswordToken).digest("hex");

  user.resetPasswordToken = tokenHash;
  user.resetPasswordExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours validity
  await user.save();

  await sendSetPasswordEmail({ user, setPasswordToken });

  return res.json({
    message: "If an account exists with this email, a password setup link has been dispatched.",
  });
};

/**
 * Reset Password using Token
 */
export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!token || typeof password !== "string" || !password) {
    return res.status(400).json({ message: "Token and new password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
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

  setAuthCookie(res, user);
  return res.json({
    success: true,
    message: "Password has been updated successfully! You can now log in.",
    user: user.toSafeObject(),
  });
};

