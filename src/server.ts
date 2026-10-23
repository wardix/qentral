import { Hono } from "hono";
import api from "./api";
import { basicAuth } from "./api/middlewares/basicAuth";
import { serverAdapter, syncDashboardQueues } from "./dashboard";
import { env } from "./config/env";
import "./queues";

const app = new Hono();
(app as any).port = env.PORT;

if (import.meta.main) {
  console.log(`[Server] Qentral Web Engine running on http://localhost:${env.PORT}`);
}

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Protect /ui and /ui/* with Basic Auth
app.use("/ui", basicAuth);
app.use("/ui/*", basicAuth);

// Handle trailing slash redirect for /ui/
app.get("/ui/", (c) => c.redirect("/ui"));

// Sync queues from Queue Registry on dashboard access
app.use("/ui", async (_c, next) => {
  syncDashboardQueues();
  await next();
});
app.use("/ui/*", async (_c, next) => {
  syncDashboardQueues();
  await next();
});

// Mount Bull-Board UI dashboard
app.route("/ui", serverAdapter.registerPlugin());

// Mount API routes under /api/v1
app.route("/api/v1", api);

export default app;
