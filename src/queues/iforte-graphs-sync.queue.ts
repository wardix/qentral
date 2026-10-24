import { createQueue } from "./registry";

export const IFORTE_GRAPHS_SYNC_QUEUE_NAME = "iforte-graphs-sync-queue";

export const iforteGraphsSyncQueue = createQueue(IFORTE_GRAPHS_SYNC_QUEUE_NAME);
