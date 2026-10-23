import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import app from "../src/server";
import { getQueueByName } from "../src/queues/registry";
import { env } from "../src/config/env";

describe("Server Queue Initialization", () => {
  it("should have fbstar-reminder-queue, iforte-reminder-queue, and email-queue registered on server startup", () => {
    const fbstarQueue = getQueueByName("fbstar-reminder-queue");
    const iforteQueue = getQueueByName("iforte-reminder-queue");
    const emailQueue = getQueueByName("email-queue");

    expect(fbstarQueue).toBeDefined();
    expect(fbstarQueue?.name).toBe("fbstar-reminder-queue");
    expect(iforteQueue).toBeDefined();
    expect(iforteQueue?.name).toBe("iforte-reminder-queue");
    expect(emailQueue).toBeDefined();
    expect(emailQueue?.name).toBe("email-queue");
  });

  it("should not return 404 for registered iforte-reminder-queue on POST /api/v1/jobs/iforte-reminder-queue", async () => {
    const queue = getQueueByName("iforte-reminder-queue");
    if (queue) {
      spyOn(queue, "add").mockImplementation(async () => {
        return { id: "test-iforte-id" } as any;
      });
    }

    const res = await app.request("/api/v1/jobs/iforte-reminder-queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.API_KEY,
      },
      body: JSON.stringify({
        jobName: "send-iforte-reminder",
        data: {},
      }),
    });

    expect(res.status).not.toBe(404);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.queue).toBe("iforte-reminder-queue");
  });

  it("should not return 404 for registered fbstar-reminder-queue on POST /api/v1/jobs/fbstar-reminder-queue", async () => {
    const queue = getQueueByName("fbstar-reminder-queue");
    if (queue) {
      spyOn(queue, "add").mockImplementation(async () => {
        return { id: "test-fbstar-id" } as any;
      });
    }

    const res = await app.request("/api/v1/jobs/fbstar-reminder-queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.API_KEY,
      },
      body: JSON.stringify({
        jobName: "send-fbstar-reminder",
        data: {},
      }),
    });

    expect(res.status).not.toBe(404);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.queue).toBe("fbstar-reminder-queue");
  });

  it("should configure port according to env.PORT", () => {
    expect((app as any).port).toBe(env.PORT);
  });
});
