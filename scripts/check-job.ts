import { fbstarReminderQueue, iforteReminderQueue, getAllQueues, getQueueByName } from "../src/queues";

async function main() {
  const jobId = process.argv[2] || "59";
  console.log(`Checking job ID: ${jobId}...`);

  // Check fbstar-reminder-queue first if looking for fbstar
  let job = await fbstarReminderQueue.getJob(jobId);

  // If not found, search in all queues
  if (!job) {
    const all = getAllQueues();
    for (const q of all) {
      const found = await q.getJob(jobId);
      if (found) {
        job = found;
        break;
      }
    }
  }

  if (!job) {
    console.log(`❌ Job ${jobId} was NOT found in any queue.`);
    process.exit(1);
  }

  const state = await job.getState();
  const queue = getQueueByName(job.queueName) || iforteReminderQueue;
  const logs = await queue.getJobLogs(job.id!);

  console.log("\n================ JOB DETAILS ================");
  console.log(`Queue:          ${job.queueName}`);
  console.log(`Job ID:         ${job.id}`);
  console.log(`Job Name:       ${job.name}`);
  console.log(`State:          ${state}`);
  console.log(`Progress:       ${JSON.stringify(job.progress)}`);
  console.log(`Timestamp:      ${job.timestamp ? new Date(job.timestamp).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "-"}`);
  console.log(`Processed On:   ${job.processedOn ? new Date(job.processedOn).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "-"}`);
  console.log(`Finished On:    ${job.finishedOn ? new Date(job.finishedOn).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "-"}`);
  console.log(`Attempts Made:  ${job.attemptsMade}`);
  console.log(`Failed Reason:  ${job.failedReason || "-"}`);
  console.log("\n--- Data ---");
  console.log(JSON.stringify(job.data, null, 2));
  console.log("\n--- Return Value / Result ---");
  console.log(JSON.stringify(job.returnvalue, null, 2));
  console.log("\n--- Options ---");
  console.log(JSON.stringify(job.opts, null, 2));
  console.log("\n--- Logs ---");
  console.log(logs.logs.length > 0 ? logs.logs.join("\n") : "(No logs)");
  if (job.stacktrace && job.stacktrace.length > 0) {
    console.log("\n--- Stacktrace ---");
    console.log(job.stacktrace.join("\n"));
  }
  console.log("=============================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error checking job:", err);
  process.exit(1);
});
