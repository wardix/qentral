import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import app from "../src/server";
import { getQueueByName } from "../src/queues/registry";
import { env } from "../src/config/env";

describe("Server Queue Initialization", () => {
  it("should have fbstar-reminder-queue, iforte-reminder-queue, email-queue, employee-summary-queue, iforte-graphs-sync-queue, alert-silence-queue, and employee-birthday-queue registered on server startup", () => {
    const fbstarQueue = getQueueByName("fbstar-reminder-queue");
    const iforteQueue = getQueueByName("iforte-reminder-queue");
    const emailQueue = getQueueByName("email-queue");
    const employeeSummaryQueue = getQueueByName("employee-summary-queue");
    const iforteGraphsSyncQueue = getQueueByName("iforte-graphs-sync-queue");
    const alertSilenceQueue = getQueueByName("alert-silence-queue");
    const employeeBirthdayQueue = getQueueByName("employee-birthday-queue");

    expect(fbstarQueue).toBeDefined();
    expect(fbstarQueue?.name).toBe("fbstar-reminder-queue");
    expect(iforteQueue).toBeDefined();
    expect(iforteQueue?.name).toBe("iforte-reminder-queue");
    expect(emailQueue).toBeDefined();
    expect(emailQueue?.name).toBe("email-queue");
    expect(employeeSummaryQueue).toBeDefined();
    expect(employeeSummaryQueue?.name).toBe("employee-summary-queue");
    expect(iforteGraphsSyncQueue).toBeDefined();
    expect(iforteGraphsSyncQueue?.name).toBe("iforte-graphs-sync-queue");
    expect(alertSilenceQueue).toBeDefined();
    expect(alertSilenceQueue?.name).toBe("alert-silence-queue");
    expect(employeeBirthdayQueue).toBeDefined();
    expect(employeeBirthdayQueue?.name).toBe("employee-birthday-queue");
  });

  it("should not return 404 for registered employee-birthday-queue on POST /api/v1/jobs/employee-birthday-queue", async () => {
    const queue = getQueueByName("employee-birthday-queue");
    if (queue) {
      spyOn(queue, "add").mockImplementation(async () => {
        return { id: "test-bday-id" } as any;
      });
    }

    const res = await app.request("/api/v1/jobs/employee-birthday-queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.API_KEY,
      },
      body: JSON.stringify({
        jobName: "upcoming-reminder",
        data: {},
      }),
    });

    expect(res.status).not.toBe(404);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.queue).toBe("employee-birthday-queue");
  });

  it("should not return 404 for registered alert-silence-queue on POST /api/v1/jobs/alert-silence-queue", async () => {
    const queue = getQueueByName("alert-silence-queue");
    if (queue) {
      spyOn(queue, "add").mockImplementation(async () => {
        return { id: "test-silence-id" } as any;
      });
    }

    const res = await app.request("/api/v1/jobs/alert-silence-queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.API_KEY,
      },
      body: JSON.stringify({
        jobName: "silence-alert",
        data: {
          attributes: 'instance=test duration=1h comment="testing"',
        },
      }),
    });

    expect(res.status).not.toBe(404);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.queue).toBe("alert-silence-queue");
  });

  it("should not return 404 for registered iforte-graphs-sync-queue on POST /api/v1/jobs/iforte-graphs-sync-queue", async () => {
    const queue = getQueueByName("iforte-graphs-sync-queue");
    if (queue) {
      spyOn(queue, "add").mockImplementation(async () => {
        return { id: "test-sync-id" } as any;
      });
    }

    const res = await app.request("/api/v1/jobs/iforte-graphs-sync-queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.API_KEY,
      },
      body: JSON.stringify({
        jobName: "sync-iforte-graphs",
        data: {},
      }),
    });

    expect(res.status).not.toBe(404);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.queue).toBe("iforte-graphs-sync-queue");
  });

  it("should not return 404 for registered employee-summary-queue on POST /api/v1/jobs/employee-summary-queue", async () => {
    const queue = getQueueByName("employee-summary-queue");
    if (queue) {
      spyOn(queue, "add").mockImplementation(async () => {
        return { id: "test-summary-id" } as any;
      });
    }

    const res = await app.request("/api/v1/jobs/employee-summary-queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.API_KEY,
      },
      body: JSON.stringify({
        jobName: "send-employee-ticket-summary",
        data: {},
      }),
    });

    expect(res.status).not.toBe(404);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.queue).toBe("employee-summary-queue");
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

  describe("GET / (Root Handler with Content Negotiation)", () => {
    it("should redirect to /ui when request Accept header includes text/html", async () => {
      const res = await app.request("/", {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/ui");
    });

    it("should return service metadata JSON when request Accept header does not include text/html", async () => {
      const res = await app.request("/", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        name: "Qentral Job Queue Engine",
        status: "running",
        endpoints: {
          health: "/health",
          dashboard: "/ui",
          api: "/api/v1/jobs/:queueName",
        },
      });
    });

    it("should return service metadata JSON by default when no Accept header is provided", async () => {
      const res = await app.request("/", {
        method: "GET",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("name", "Qentral Job Queue Engine");
      expect(data).toHaveProperty("status", "running");
    });
  });
});
