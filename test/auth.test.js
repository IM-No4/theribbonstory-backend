import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mock, query, startServer, fakeUser, authAs } from "./helpers.js";
import User from "../src/models/User.js";
import { AUTH_COOKIE } from "../src/utils/authCookie.js";
import { generateToken } from "../src/utils/generateToken.js";

let server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});
beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
});
afterEach(() => {
  mock.restoreAll();
  delete process.env.GOOGLE_CLIENT_ID;
});

const post = (path, body, headers = {}) =>
  fetch(`${server.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const sessionCookie = (res) => res.headers.getSetCookie().find((c) => c.startsWith(`${AUTH_COOKIE}=`));

/** A user document whose password is "correct-password" */
const userWithPassword = (overrides) =>
  fakeUser({
    comparePassword: async (candidate) => candidate === "correct-password",
    save: async () => {},
    ...overrides,
  });

describe("Login sessions", () => {
  it("issues the session as an httpOnly SameSite cookie, not in the body", async () => {
    mock.method(User, "findOne", () => query(userWithPassword()));
    const res = await post("/api/auth/login", { email: "customer@example.com", password: "correct-password" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.token, undefined);
    assert.equal(body.user.email, "customer@example.com");

    const cookie = sessionCookie(res);
    assert.ok(cookie, "session cookie set");
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//);
  });

  it("rejects a wrong password without setting a cookie", async () => {
    mock.method(User, "findOne", () => query(userWithPassword()));
    const res = await post("/api/auth/login", { email: "customer@example.com", password: "nope" });
    assert.equal(res.status, 401);
    assert.equal(sessionCookie(res), undefined);
  });

  it("rejects non-string credentials", async () => {
    const res = await post("/api/auth/login", { email: { $gt: "" }, password: "x" });
    assert.equal(res.status, 400);
  });

  it("authenticates requests with the session cookie", async () => {
    const user = fakeUser();
    authAs(User, user);
    const res = await fetch(`${server.url}/api/auth/me`, {
      headers: { Cookie: `${AUTH_COOKIE}=${generateToken(user._id)}` },
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).user.email, user.email);
  });

  it("logout clears the session cookie", async () => {
    const res = await post("/api/auth/logout", {});
    assert.equal(res.status, 200);
    assert.match(sessionCookie(res), /Expires=Thu, 01 Jan 1970/);
  });

  it("rejects a tampered token", async () => {
    const user = fakeUser();
    authAs(User, user);
    const token = generateToken(user._id);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    const res = await fetch(`${server.url}/api/auth/me`, { headers: { Cookie: `${AUTH_COOKIE}=${tampered}` } });
    assert.equal(res.status, 401);
  });

  it("rejects an unsigned (alg: none) token", async () => {
    const user = fakeUser();
    authAs(User, user);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ id: String(user._id) })}.`;
    const res = await fetch(`${server.url}/api/auth/me`, { headers: { Authorization: `Bearer ${unsigned}` } });
    assert.equal(res.status, 401);
  });
});

describe("Cross-site request protection for cookie sessions", () => {
  const addAddress = (origin) => {
    const user = fakeUser({ addresses: [], save: async () => {} });
    authAs(User, user);
    return fetch(`${server.url}/api/auth/address`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${AUTH_COOKIE}=${generateToken(user._id)}`,
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify({ line1: "1 Road", city: "Pune", postalCode: "411001" }),
    });
  };

  it("blocks state-changing requests from other origins", async () => {
    const res = await addAddress("https://evil.example");
    assert.equal(res.status, 403);
  });

  it("allows them from the storefront", async () => {
    const res = await addAddress("https://theribbonstory.com");
    assert.equal(res.status, 201);
  });
});

describe("Google sign-in", () => {
  it("does not accept a bare email address", async () => {
    mock.method(User, "findOne", () => query(fakeUser({ role: "admin", email: "admin@theribbonstory.com" })));
    const res = await post("/api/auth/google", { email: "admin@theribbonstory.com", name: "Admin" });
    assert.equal(res.status, 400);
    assert.equal(sessionCookie(res), undefined);
  });

  it("rejects a forged, unsigned ID token", async () => {
    mock.method(User, "findOne", () => query(fakeUser({ role: "admin" })));
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const forged = [
      b64({ alg: "RS256", kid: "forged" }),
      b64({
        email: "admin@theribbonstory.com",
        email_verified: true,
        aud: process.env.GOOGLE_CLIENT_ID,
        iss: "accounts.google.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      "c2lnbmF0dXJl",
    ].join(".");
    const res = await post("/api/auth/google", { credential: forged });
    assert.equal(res.status, 401);
    assert.equal(sessionCookie(res), undefined);
  });

  it("returns 503 when Google sign-in is not configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await post("/api/auth/google", { credential: "a.b.c" });
    assert.equal(res.status, 503);
  });
});

describe("Account changes", () => {
  const put = (token, body) =>
    fetch(`${server.url}/api/auth/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  it("requires the current password to change the password", async () => {
    const user = userWithPassword();
    const token = authAs(User, user);
    let res = await put(token, { password: "new-password-123" });
    assert.equal(res.status, 400);
    res = await put(token, { password: "new-password-123", currentPassword: "wrong" });
    assert.equal(res.status, 400);
    res = await put(token, { password: "new-password-123", currentPassword: "correct-password" });
    assert.equal(res.status, 200);
  });

  it("requires the current password to change the email", async () => {
    const user = userWithPassword();
    const token = authAs(User, user);
    const res = await put(token, { email: "attacker@example.com" });
    assert.equal(res.status, 400);
  });

  it("set-password does not reveal whether an account exists", async () => {
    mock.method(User, "findOne", () => query(null));
    const res = await post("/api/auth/set-password", { email: "nobody@example.com" });
    assert.equal(res.status, 200);
    assert.match((await res.json()).message, /If an account exists/);
  });

  it("registration enforces the minimum password length", async () => {
    const res = await post("/api/auth/register", { name: "A", email: "a@example.com", password: "short" });
    assert.equal(res.status, 400);
  });
});
