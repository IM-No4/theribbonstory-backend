import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mock, startServer, fakeUser, authAs } from "./helpers.js";
import User from "../src/models/User.js";
import { getTransporter } from "../src/services/emailService.js";

let server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.close();
});

const transporter = getTransporter("NOREPLY");
afterEach(() => {
  mock.restoreAll();
  transporter.isMock = true;
  delete transporter.verify;
});

const testEmail = (token) =>
  fetch(`${server.url}/api/admin/test-email`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe("Admin test email", () => {
  it("is admin-only", async () => {
    assert.equal((await testEmail()).status, 401);
    assert.equal((await testEmail(authAs(User, fakeUser()))).status, 403);
  });

  it("explains when email isn't configured", async () => {
    const res = await testEmail(authAs(User, fakeUser({ role: "admin" })));
    assert.equal(res.status, 502);
    assert.match((await res.json()).message, /set SMTP_HOST, SMTP_USER and SMTP_PASS/);
  });

  it("sends a test message to the admin", async () => {
    transporter.isMock = false;
    transporter.verify = async () => true;
    const sent = [];
    mock.method(transporter, "sendMail", async (m) => sent.push(m));
    const res = await testEmail(authAs(User, fakeUser({ role: "admin", email: "owner@example.com" })));
    assert.equal(res.status, 200);
    assert.equal(sent[0].to, "owner@example.com");
  });

  it("turns SMTP errors into plain language", async () => {
    transporter.isMock = false;
    transporter.verify = async () => {
      throw Object.assign(new Error("Invalid login: 535"), { code: "EAUTH" });
    };
    const res = await testEmail(authAs(User, fakeUser({ role: "admin" })));
    assert.equal(res.status, 502);
    assert.match((await res.json()).message, /rejected the username or password/);
  });
});
