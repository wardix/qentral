import type { Worker } from "bullmq";
import { createEmailWorker } from "./email.worker";
import { createFbstarReminderWorker } from "./fbstar-reminder.worker";
import { createIforteReminderWorker } from "./iforte-reminder.worker";

let activeWorkers: Worker[] = [];

export function startWorkers(): Worker[] {
  if (activeWorkers.length > 0) {
    return activeWorkers;
  }

  const emailWorker = createEmailWorker();
  const fbstarWorker = createFbstarReminderWorker();
  const iforteWorker = createIforteReminderWorker();
  activeWorkers = [emailWorker, fbstarWorker, iforteWorker];

  return activeWorkers;
}

export function getActiveWorkers(): Worker[] {
  return [...activeWorkers];
}

export async function stopWorkers(): Promise<void> {
  const workersToClose = [...activeWorkers];
  activeWorkers = [];

  await Promise.all(workersToClose.map((w) => w.close()));
}

export * from "./email.worker";
export * from "./fbstar-reminder.worker";
export * from "./iforte-reminder.worker";
