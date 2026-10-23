import { describe, it, expect, beforeEach } from "bun:test";
import {
  employeeSummaryQueue,
  EMPLOYEE_SUMMARY_QUEUE_NAME,
} from "../../src/queues/employee-summary.queue";
import { getQueueByName, registerQueue } from "../../src/queues/registry";

describe("Employee Ticket Summary Queue Registration", () => {
  beforeEach(() => {
    registerQueue(employeeSummaryQueue);
  });

  it("should export employeeSummaryQueue with name employee-summary-queue", () => {
    expect(EMPLOYEE_SUMMARY_QUEUE_NAME).toBe("employee-summary-queue");
    expect(employeeSummaryQueue.name).toBe("employee-summary-queue");
  });

  it("should be registered in the queue registry automatically", () => {
    const queue = getQueueByName(EMPLOYEE_SUMMARY_QUEUE_NAME);
    expect(queue).toBeDefined();
    expect(queue?.name).toBe("employee-summary-queue");
  });
});
