import { createQueue } from "./registry";

export const FBSTAR_REMINDER_QUEUE_NAME = "fbstar-reminder-queue";

export const fbstarReminderQueue = createQueue(FBSTAR_REMINDER_QUEUE_NAME);
