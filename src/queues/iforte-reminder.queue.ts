import { createQueue } from "./registry";

export const IFORTE_REMINDER_QUEUE_NAME = "iforte-reminder-queue";

export const iforteReminderQueue = createQueue(IFORTE_REMINDER_QUEUE_NAME);
