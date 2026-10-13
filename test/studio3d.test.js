import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";

const getJson = async (path, token) => {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const headers = {};
    if (token) headers.Cookie = `token=${token}`;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("3D Keepsake Studio Endpoints", async (t) => {
  await t.test("GET /api/3d-studio/orders requires authentication", async () => {
    const { status } = await getJson("/api/3d-studio/orders");
    assert.equal(status, 401);
  });
});
