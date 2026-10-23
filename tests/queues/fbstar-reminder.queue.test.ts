import { describe, it, expect, beforeEach } from "bun:test";
import {
  fbstarReminderQueue,
  FBSTAR_REMINDER_QUEUE_NAME,
} from "../../src/queues/fbstar-reminder.queue";
import { getQueueByName, registerQueue } from "../../src/queues/registry";

describe("FBStar Reminder Queue Registration", () => {
  beforeEach(() => {
    registerQueue(fbstarReminderQueue);
  });

  it("should export fbstarReminderQueue with name fbstar-reminder-queue", () => {
    expect(FBSTAR_REMINDER_QUEUE_NAME).toBe("fbstar-reminder-queue");
    expect(fbstarReminderQueue.name).toBe("fbstar-reminder-queue");
  });

  it("should be registered in the queue registry automatically", () => {
    const queue = getQueueByName(FBSTAR_REMINDER_QUEUE_NAME);
    expect(queue).toBeDefined();
    expect(queue?.name).toBe("fbstar-reminder-queue");
  });
});
