import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mock, query } from "./helpers.js";
import User from "../src/models/User.js";
import { setAdminAccount } from "../src/utils/setAdmin.js";

afterEach(() => mock.restoreAll());

describe("Set admin account", () => {
  it("creates the admin when missing", async () => {
    mock.method(User, "findOne", () => query(null));
    const created = mock.method(User, "create", async (d) => d);
    const r = await setAdminAccount({ email: " Admin@TheRibbonStory.com ", password: "a-long-new-password" });
    assert.deepEqual(r, { created: true, email: "admin@theribbonstory.com" });
    assert.equal(created.mock.calls[0].arguments[0].role, "admin");
  });

  it("resets the password of an existing account and makes it admin", async () => {
    const user = { email: "admin@theribbonstory.com", role: "customer", password: "old", saved: false, async save() { this.saved = true; } };
    mock.method(User, "findOne", () => query(user));
    const r = await setAdminAccount({ email: "admin@theribbonstory.com", password: "a-long-new-password" });
    assert.equal(r.created, false);
    assert.equal(user.role, "admin");
    assert.equal(user.password, "a-long-new-password");
    assert.ok(user.saved);
  });

  it("refuses short passwords and bad emails", async () => {
    await assert.rejects(setAdminAccount({ email: "admin@theribbonstory.com", password: "admin123" }), /at least 12/);
    await assert.rejects(setAdminAccount({ email: "nope", password: "a-long-new-password" }), /valid admin email/);
  });
});
