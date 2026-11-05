import { createQueue } from "./registry";

export const NUSACONTACT_CONTACT_SYNC_QUEUE_NAME = "nusacontact-contact-sync-queue";

export const nusacontactContactSyncQueue = createQueue(NUSACONTACT_CONTACT_SYNC_QUEUE_NAME);
