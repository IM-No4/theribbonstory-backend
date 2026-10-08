// Shared test helpers: tests stub Mongoose model methods with node:test's `mock`
// and exercise the real Express app over HTTP — no MongoDB needed.
import mongoose from "mongoose";
import { mock } from "node:test";

process.env.NODE_ENV = "test";
// Unstubbed queries must fail immediately instead of waiting for a connection
mongoose.set("bufferCommands", false);

const { default: app } = await import("../src/app.js");
const { generateToken } = await import("../src/utils/generateToken.js");

export { app, mock };

export const startServer = () =>
  new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });

/** Minimal res object for calling controllers directly */
export const mockRes = () => {
  const res = { statusCode: 200, body: undefined, cookies: {}, headers: {} };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  res.cookie = (name, value, options) => ((res.cookies[name] = { value, options }), res);
  res.clearCookie = (name, options) => ((res.cookies[name] = { value: "", options, cleared: true }), res);
  res.set = (k, v) => ((res.headers[k] = v), res);
  return res;
};

/** A query-like object so stubs can be chained (.select/.sort/.limit/.populate) or awaited */
export const query = (value) => {
  const q = {
    select: () => q,
    sort: () => q,
    limit: () => q,
    skip: () => q,
    populate: () => q,
    exec: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return q;
};

export const fakeUser = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  name: "Test Customer",
  email: "customer@example.com",
  role: "customer",
  addresses: [],
  toSafeObject() {
    return { id: this._id, name: this.name, email: this.email, role: this.role, addresses: this.addresses };
  },
  ...overrides,
});

/** Stub User.findById so the `protect` middleware resolves this user, and return its bearer token */
export const authAs = (User, user) => {
  mock.method(User, "findById", (id) => query(String(id) === String(user._id) ? user : null));
  return generateToken(user._id);
};
