import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import app from "../../src/server";
import { env } from "../../src/config/env";
import { emailQueue } from "../../src/queues/email.queue";
import { registerQueue, getAllQueues } from "../../src/queues/registry";

describe("Bull-Board UI Dashboard (/ui)", () => {
  const validAuth = "Basic " + Buffer.from(`${env.DASHBOARD_USERNAME}:${env.DASHBOARD_PASSWORD}`).toString("base64");
  const invalidAuth = "Basic " + Buffer.from("wronguser:wrongpassword").toString("base64");

  beforeEach(() => {
    registerQueue(emailQueue);
    for (const q of getAllQueues()) {
      spyOn(q, "getJobCounts").mockImplementation(async () => {
        return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
      });
    }
  });

  it("should reject access to /ui without Basic Auth header with 401", async () => {
    const res = await app.request("/ui");

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBeDefined();
    expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("should reject access to /ui with invalid credentials with 401", async () => {
    const res = await app.request("/ui", {
      headers: {
        Authorization: invalidAuth,
      },
    });

    expect(res.status).toBe(401);
  });

  it("should allow access to /ui with valid credentials and return HTML", async () => {
    const res = await app.request("/ui", {
      headers: {
        Authorization: validAuth,
      },
    });

    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType).toBeDefined();
    expect(contentType).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("Bull Dashboard");
  });

  it("should handle /ui/ route with valid credentials", async () => {
    const res = await app.request("/ui/", {
      headers: {
        Authorization: validAuth,
      },
    });

    expect([200, 301, 302]).toContain(res.status);
  });

  it("should serve Bull-Board API queues with valid credentials", async () => {
    const res = await app.request("/ui/api/queues", {
      headers: {
        Authorization: validAuth,
      },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json).toHaveProperty("queues");
    expect(Array.isArray(json.queues)).toBe(true);
    const queueNames = json.queues.map((q: any) => q.name);
    expect(queueNames).toContain("email-queue");
  });

  it("should serve static assets under /ui/static/* with valid credentials", async () => {
    const res = await app.request("/ui/static/images/logo.svg", {
      headers: {
        Authorization: validAuth,
      },
    });

    expect(res.status).toBe(200);
  });

  it("should protect static assets under /ui/static/* without Basic Auth with 401", async () => {
    const res = await app.request("/ui/static/images/logo.svg");

    expect(res.status).toBe(401);
  });
});
