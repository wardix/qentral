import { describe, it, expect, afterEach } from "bun:test";
import { getDefaultRetentionOptions } from "../../src/config/redis";
import { env } from "../../src/config/env";
import { createQueue, getQueueByName, unregisterQueue } from "../../src/queues/registry";

describe("Redis Memory Retention Policy", () => {
  afterEach(async () => {
    const q1 = getQueueByName("retention-verify-queue");
    if (q1) {
      await q1.close();
      unregisterQueue("retention-verify-queue");
    }

    const q2 = getQueueByName("custom-retention-queue");
    if (q2) {
      await q2.close();
      unregisterQueue("custom-retention-queue");
    }
  });

  it("should provide default retention limits matching env configuration", () => {
    const options = getDefaultRetentionOptions();

    expect(options.removeOnComplete).toEqual({ count: env.JOB_RETENTION_COMPLETED_COUNT });
    expect(options.removeOnFail).toEqual({ count: env.JOB_RETENTION_FAILED_COUNT });
  });

  it("should automatically attach retention options to queues created via createQueue", () => {
    const testQueue = createQueue("retention-verify-queue");

    expect(testQueue.defaultJobOptions?.removeOnComplete).toEqual({
      count: env.JOB_RETENTION_COMPLETED_COUNT,
    });
    expect(testQueue.defaultJobOptions?.removeOnFail).toEqual({
      count: env.JOB_RETENTION_FAILED_COUNT,
    });
  });

  it("should allow custom overrides of retention options when needed", () => {
    const customQueue = createQueue("custom-retention-queue", {
      defaultJobOptions: {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      },
    });

    expect(customQueue.defaultJobOptions?.removeOnComplete).toEqual({ count: 50 });
    expect(customQueue.defaultJobOptions?.removeOnFail).toEqual({ count: 200 });
  });
});
