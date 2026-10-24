import { createQueue } from "./registry";

export const ALERT_SILENCE_QUEUE_NAME = "alert-silence-queue";

export const alertSilenceQueue = createQueue(ALERT_SILENCE_QUEUE_NAME);
