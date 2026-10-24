import { describe, it, expect, beforeEach } from "bun:test";
import {
  alertSilenceQueue,
  ALERT_SILENCE_QUEUE_NAME,
} from "../../src/queues/alert-silence.queue";
import { getQueueByName, registerQueue } from "../../src/queues/registry";

describe("Alert Silence Queue Registration", () => {
  beforeEach(() => {
    registerQueue(alertSilenceQueue);
  });

  it("should export alertSilenceQueue with name alert-silence-queue", () => {
    expect(ALERT_SILENCE_QUEUE_NAME).toBe("alert-silence-queue");
    expect(alertSilenceQueue.name).toBe("alert-silence-queue");
  });

  it("should be registered in the queue registry automatically", () => {
    const queue = getQueueByName(ALERT_SILENCE_QUEUE_NAME);
    expect(queue).toBeDefined();
    expect(queue?.name).toBe("alert-silence-queue");
  });
});
