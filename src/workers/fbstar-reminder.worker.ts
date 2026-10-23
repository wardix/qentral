import { Worker, type Job, type WorkerOptions } from "bullmq";
import { getRedisConnection } from "../config/redis";
import { env } from "../config/env";
import { FBSTAR_REMINDER_QUEUE_NAME } from "../queues/fbstar-reminder.queue";
import type { FbstarReminderJobData, FbstarReminderJobResult } from "../shared/types";

export { FBSTAR_REMINDER_QUEUE_NAME };

export interface ParsedTicket {
  ticket_number: string;
  circuit_id: string;
  category: string;
  age_hours: number;
  timestamp_unix: number;
}

export async function fbstarReminderProcessor(
  job: Job<FbstarReminderJobData, FbstarReminderJobResult>
): Promise<FbstarReminderJobResult> {
  await job.log(`[Worker] Memulai pemrosesan FBStar reminder job ${job.id}`);
  await job.updateProgress(10);

  const response = await fetch(env.PROM_TICKETS_URL);
  if (!response.ok) {
    throw new Error(`Gagal mengambil metrik: ${response.statusText}`);
  }

  await job.updateProgress(30);

  const text = await response.text();
  const lines = text.split("\n");
  const tickets: ParsedTicket[] = [];

  const metricsRegex = /operator_ticket_created_timestamp_seconds\{(.*)\} (\d+)/;

  for (const line of lines) {
    const match = line.match(metricsRegex);
    if (match) {
      const [_, tags, timestamp] = match;
      const ticketData: Record<string, string> = {
        timestamp_unix: timestamp,
      };

      const tagPairs = tags.match(/(\w+)="([^"]*)"/g);
      if (tagPairs) {
        for (const pair of tagPairs) {
          const [key, value] = pair.split("=");
          if (key && value) {
            ticketData[key] = value.replace(/"/g, "");
          }
        }
      }

      if (
        ticketData.operator === "fbstar" &&
        ticketData.ticket_number !== "pending" &&
        ticketData.ticket_number !== undefined
      ) {
        const ts = Number.parseInt(ticketData.timestamp_unix, 10);
        const ageHours = Math.floor((Date.now() / 1000 - ts) / 3600);

        tickets.push({
          ticket_number: ticketData.ticket_number,
          circuit_id: ticketData.circuit_id || "-",
          category: ticketData.category || "-",
          age_hours: ageHours,
          timestamp_unix: ts,
        });
      }
    }
  }

  if (tickets.length === 0) {
    await job.log("[Worker] Tidak ada tiket FBStar yang perlu di-follow up.");
    await job.updateProgress(100);
    return {
      sent: false,
      totalTickets: 0,
      message: "Tidak ada tiket FBStar yang perlu di-follow up.",
    };
  }

  // Sort by timestamp_unix (oldest first)
  tickets.sort((a, b) => a.timestamp_unix - b.timestamp_unix);

  const messageLines = tickets.map(
    ({ ticket_number, circuit_id, category, age_hours }, index) => {
      let alertIcon = "";
      if (age_hours >= 24) {
        alertIcon = "🚨";
      } else if (age_hours >= 18) {
        alertIcon = "⚠️";
      }

      let durationText = `${age_hours} jam`;
      if (age_hours >= 48) {
        const days = Math.floor(age_hours / 24);
        durationText = `${days}+ hari`;
      }

      const categoryText = category !== "unknown" ? ` ${category}` : "";
      return `${index + 1}. ${alertIcon}${ticket_number} ${circuit_id}${categoryText} ${durationText}`;
    }
  );

  const fullMessage = `rekan fiberstar, mohon dibantu tindak lanjut tiket berikut ini:\n${messageLines.join(
    "\n"
  )}`;

  const recipient = job.data?.to ?? env.WA_FBSTAR_TARGET_NUMBER;

  await job.updateProgress(60);
  await job.log(`[Worker] Mengirim ${tickets.length} reminder tiket ke WhatsApp (${recipient})...`);

  const waResponse = await fetch(env.WA_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WA_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: recipient,
      body: "text",
      text: fullMessage,
    }),
  });

  if (!waResponse.ok) {
    const errorText = await waResponse.text();
    throw new Error(`Gagal mengirim WhatsApp: ${waResponse.statusText} - ${errorText}`);
  }

  await job.updateProgress(100);
  await job.log(`[Worker] Berhasil mengirim reminder tiket FBStar via WhatsApp.`);

  return {
    sent: true,
    totalTickets: tickets.length,
    recipient,
    sentAt: new Date().toISOString(),
  };
}

export function createFbstarReminderWorker(
  options?: Partial<WorkerOptions>
): Worker<FbstarReminderJobData, FbstarReminderJobResult> {
  const isTest = process.env.NODE_ENV === "test";
  return new Worker<FbstarReminderJobData, FbstarReminderJobResult>(
    FBSTAR_REMINDER_QUEUE_NAME,
    fbstarReminderProcessor,
    {
      connection: getRedisConnection() as any,
      concurrency: env.DEFAULT_WORKER_CONCURRENCY,
      autorun: isTest ? false : true,
      ...options,
    }
  );
}
