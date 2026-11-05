import { describe, it, expect } from "bun:test";
import {
  nusacontactContactSyncQueue,
  NUSACONTACT_CONTACT_SYNC_QUEUE_NAME,
} from "../../src/queues/nusacontact-contact-sync.queue";
import { getQueueByName } from "../../src/queues/registry";

describe("Nusacontact Contact Sync Queue Registration", () => {
  it("should export nusacontactContactSyncQueue with name nusacontact-contact-sync-queue", () => {
    expect(NUSACONTACT_CONTACT_SYNC_QUEUE_NAME).toBe("nusacontact-contact-sync-queue");
    expect(nusacontactContactSyncQueue).toBeDefined();
    expect(nusacontactContactSyncQueue.name).toBe("nusacontact-contact-sync-queue");
  });

  it("should be registered in the queue registry automatically", () => {
    const registered = getQueueByName("nusacontact-contact-sync-queue");
    expect(registered).toBeDefined();
    expect(registered?.name).toBe("nusacontact-contact-sync-queue");
  });
});
