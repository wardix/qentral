import { describe, it, expect, beforeEach } from "bun:test";
import {
  employeeBirthdayQueue,
  EMPLOYEE_BIRTHDAY_QUEUE_NAME,
} from "../../src/queues/employee-birthday.queue";
import { getQueueByName, registerQueue } from "../../src/queues/registry";

describe("Employee Birthday Queue Registration", () => {
  beforeEach(() => {
    registerQueue(employeeBirthdayQueue);
  });

  it("should export employeeBirthdayQueue with name employee-birthday-queue", () => {
    expect(EMPLOYEE_BIRTHDAY_QUEUE_NAME).toBe("employee-birthday-queue");
    expect(employeeBirthdayQueue.name).toBe("employee-birthday-queue");
  });

  it("should be registered in the queue registry automatically", () => {
    const queue = getQueueByName(EMPLOYEE_BIRTHDAY_QUEUE_NAME);
    expect(queue).toBeDefined();
    expect(queue?.name).toBe("employee-birthday-queue");
  });
});
