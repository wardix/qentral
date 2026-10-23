import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import app from "../../src/server";
import { env } from "../../src/config/env";
import { emailQueue } from "../../src/queues/email.queue";
import { registerQueue } from "../../src/queues/registry";

describe("Repeatable Jobs API (GET & DELETE /api/v1/jobs/:queueName/repeatable)", () => {
  const originalGetRepeatableJobs = (emailQueue as any).getRepeatableJobs;
  const originalRemoveRepeatableByKey = (emailQueue as any).removeRepeatableByKey;

  beforeEach(() => {
    registerQueue(emailQueue);
  });

  afterEach(() => {
    (emailQueue as any).getRepeatableJobs = originalGetRepeatableJobs;
    (emailQueue as any).removeRepeatableByKey = originalRemoveRepeatableByKey;
  });

  describe("Authentication", () => {
    it("should reject GET /api/v1/jobs/:queueName/repeatable without API Key with 401", async () => {
      const res = await app.request("/api/v1/jobs/email-queue/repeatable", {
        method: "GET",
      });
      expect(res.status).toBe(401);
    });

    it("should reject DELETE /api/v1/jobs/:queueName/repeatable/:key without API Key with 401", async () => {
      const res = await app.request("/api/v1/jobs/email-queue/repeatable/some-key", {
        method: "DELETE",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("Queue validation", () => {
    it("should return 404 when queue does not exist on GET", async () => {
      const res = await app.request("/api/v1/jobs/unknown-queue/repeatable", {
        method: "GET",
        headers: { "x-api-key": env.API_KEY },
      });
      expect(res.status).toBe(404);
    });

    it("should return 404 when queue does not exist on DELETE", async () => {
      const res = await app.request("/api/v1/jobs/unknown-queue/repeatable/some-key", {
        method: "DELETE",
        headers: { "x-api-key": env.API_KEY },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("Listing & Deleting Repeatable Jobs", () => {
    it("should list active repeatable jobs for a queue", async () => {
      const mockJobs = [
        {
          key: "email-queue:every_hour:::0 * * * *",
          name: "send-email-cron",
          id: "1",
          pattern: "0 * * * *",
          next: 1700000000000,
        },
      ];

      (emailQueue as any).getRepeatableJobs = mock(async () => mockJobs);

      const res = await app.request("/api/v1/jobs/email-queue/repeatable", {
        method: "GET",
        headers: { "x-api-key": env.API_KEY },
      });

      const json = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBe(1);
      expect(json.data[0].name).toBe("send-email-cron");
    });

    it("should delete repeatable job by key", async () => {
      const removeMock = mock(async (_key: string) => true);
      (emailQueue as any).removeRepeatableByKey = removeMock;

      const repeatKey = "email-queue:every_hour:::0 * * * *";
      const encodedKey = encodeURIComponent(repeatKey);

      const res = await app.request(`/api/v1/jobs/email-queue/repeatable/${encodedKey}`, {
        method: "DELETE",
        headers: { "x-api-key": env.API_KEY },
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(removeMock).toHaveBeenCalledWith(repeatKey);
    });
  });
});
