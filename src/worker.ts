import { startWorkers, stopWorkers, getActiveWorkers } from "./workers";

let isShuttingDown = false;
let listenersAttached = false;

export async function gracefulShutdown(signal: string, shouldExit = true): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Worker Engine] Received ${signal}. Shutting down gracefully...`);
  await stopWorkers();
  console.log("[Worker Engine] All workers stopped cleanly.");

  isShuttingDown = false;
  if (shouldExit) {
    process.exit(0);
  }
}

export function attachSignalListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

// Auto-start when executed as CLI entrypoint
if (import.meta.main) {
  attachSignalListeners();
  console.log("[Worker Engine] Starting workers...");
  const workers = startWorkers();
  for (const worker of workers) {
    worker.on("active", (job) => {
      console.log(`[Worker:${worker.name}] Job ${job.id} (${job.name}) started`);
    });
    worker.on("completed", (job, result) => {
      console.log(`[Worker:${worker.name}] Job ${job.id} (${job.name}) completed:`, JSON.stringify(result));
    });
    worker.on("failed", (job, err) => {
      console.log(`[Worker:${worker.name}] Job ${job?.id} (${job?.name}) failed:`, err.message);
    });
  }
  console.log(`[Worker Engine] ${workers.length} worker(s) active and listening for jobs.`);
}

export { startWorkers, stopWorkers, getActiveWorkers };
