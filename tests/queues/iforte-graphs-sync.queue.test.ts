import { describe, it, expect, beforeEach } from "bun:test";
import {
  iforteGraphsSyncQueue,
  IFORTE_GRAPHS_SYNC_QUEUE_NAME,
} from "../../src/queues/iforte-graphs-sync.queue";
import { getQueueByName, registerQueue } from "../../src/queues/registry";

describe("iForte Graphs Sync Queue Registration", () => {
  beforeEach(() => {
    registerQueue(iforteGraphsSyncQueue);
  });

  it("should export iforteGraphsSyncQueue with name iforte-graphs-sync-queue", () => {
    expect(IFORTE_GRAPHS_SYNC_QUEUE_NAME).toBe("iforte-graphs-sync-queue");
    expect(iforteGraphsSyncQueue.name).toBe("iforte-graphs-sync-queue");
  });

  it("should be registered in the queue registry automatically", () => {
    const queue = getQueueByName(IFORTE_GRAPHS_SYNC_QUEUE_NAME);
    expect(queue).toBeDefined();
    expect(queue?.name).toBe("iforte-graphs-sync-queue");
  });
});
