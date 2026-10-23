import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import app from "../src/server";
import { env } from "../src/config/env";
import { emailQueue } from "../src/queues/email.queue";
import { registerQueue, getAllQueues } from "../src/queues/registry";
import { emailProcessor } from "../src/workers/email.worker";
import type { PublishJobResponse, JobStatusResponse } from "../src/shared/types";

describe("End-to-End Sanity Test (Publish -> Process -> Result -> UI)", () => {
  const store = new Map<string, any>();

  beforeEach(() => {
    registerQueue(emailQueue);
    store.clear();

    for (const q of getAllQueues()) {
      spyOn(q, "getJobCounts").mockImplementation(async () => {
        return { waiting: 0, active: 0, completed: 1, failed: 0, delayed: 0, paused: 0 };
      });
    }

    spyOn(emailQueue, "add").mockImplementation(async (name: string, data: any, opts?: any) => {
      const id = opts?.jobId || "e2e-job-001";
      const jobRecord = {
        id,
        name,
        data,
        opts: { ...opts },
        progress: 0,
        returnvalue: null,
        failedReason: null,
        state: "waiting",
        getState: async function () {
          return this.state;
        },
        updateProgress: async function (p: number) {
          this.progress = p;
        },
        log: async function (_msg: string) {},
      };
      store.set(id, jobRecord);
      return jobRecord as any;
    });

    spyOn(emailQueue, "getJob").mockImplementation(async (id: string) => {
      return store.get(id) || null;
    });
  });

  it("should complete full lifecycle: publish job, process with worker, check status, and view in dashboard", async () => {
    // Step 1: Publish job via HTTP API
    const publishRes = await app.request("/api/v1/jobs/email-queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.API_KEY,
      },
      body: JSON.stringify({
        jobName: "send-welcome-email",
        data: { to: "alice@example.com", subject: "Welcome to Qentral!" },
        options: { jobId: "e2e-job-001" },
      }),
    });

    expect(publishRes.status).toBe(202);
    const publishData = (await publishRes.json()) as PublishJobResponse;
    expect(publishData.success).toBe(true);
    expect(publishData.queue).toBe("email-queue");
    expect(publishData.jobId).toBe("e2e-job-001");

    // Step 2: Worker processes the job
    const storedJob = store.get("e2e-job-001");
    expect(storedJob).toBeDefined();

    const processResult = await emailProcessor(storedJob);
    expect(processResult.sent).toBe(true);
    expect(processResult.recipient).toBe("alice@example.com");

    // Simulate BullMQ marking job completed
    storedJob.state = "completed";
    storedJob.returnvalue = processResult;

    // Step 3: Check Job Status API
    const statusRes = await app.request("/api/v1/jobs/email-queue/e2e-job-001", {
      method: "GET",
      headers: {
        "x-api-key": env.API_KEY,
      },
    });

    expect(statusRes.status).toBe(200);
    const statusData = (await statusRes.json()) as JobStatusResponse<typeof processResult>;
    expect(statusData.id).toBe("e2e-job-001");
    expect(statusData.state).toBe("completed");
    expect(statusData.progress).toBe(100);
    expect(statusData.result?.sent).toBe(true);
    expect(statusData.result?.recipient).toBe("alice@example.com");

    // Step 4: Verify visibility on Bull-Board UI API
    const basicAuth = "Basic " + Buffer.from(`${env.DASHBOARD_USERNAME}:${env.DASHBOARD_PASSWORD}`).toString("base64");
    const uiRes = await app.request("/ui/api/queues", {
      method: "GET",
      headers: {
        Authorization: basicAuth,
      },
    });

    expect(uiRes.status).toBe(200);
    const uiData = (await uiRes.json()) as any;
    expect(uiData.queues.some((q: any) => q.name === "email-queue")).toBe(true);
  });
});
