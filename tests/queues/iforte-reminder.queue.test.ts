import { describe, it, expect, beforeEach } from "bun:test";
import {
  iforteReminderQueue,
  IFORTE_REMINDER_QUEUE_NAME,
} from "../../src/queues/iforte-reminder.queue";
import { getQueueByName, registerQueue } from "../../src/queues/registry";

describe("iForte Reminder Queue Registration", () => {
  beforeEach(() => {
    registerQueue(iforteReminderQueue);
  });

  it("should export iforteReminderQueue with name iforte-reminder-queue", () => {
    expect(IFORTE_REMINDER_QUEUE_NAME).toBe("iforte-reminder-queue");
    expect(iforteReminderQueue.name).toBe("iforte-reminder-queue");
  });

  it("should be registered in the queue registry automatically", () => {
    const queue = getQueueByName(IFORTE_REMINDER_QUEUE_NAME);
    expect(queue).toBeDefined();
    expect(queue?.name).toBe("iforte-reminder-queue");
  });
});
