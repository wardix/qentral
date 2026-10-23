import { Worker, type Job, type WorkerOptions } from "bullmq";
import { getRedisConnection } from "../config/redis";
import { env } from "../config/env";
import { IFORTE_REMINDER_QUEUE_NAME } from "../queues/iforte-reminder.queue";
import type { IforteReminderJobData, IforteReminderJobResult } from "../shared/types";

export { IFORTE_REMINDER_QUEUE_NAME };

export interface IforteTicket {
  ticket_id: number;
  insert_time: string;
  ticket_status: string;
  customer_id: string;
  subscriber_id: number;
  subscription_status: string;
  subscriber_name: string;
  ticket_subject: string;
}

export async function iforteReminderProcessor(
  job: Job<IforteReminderJobData, IforteReminderJobResult>
): Promise<IforteReminderJobResult> {
  await job.log(`[Worker] Memulai pemrosesan iForte reminder job ${job.id}`);
  await job.updateProgress(10);

  const response = await fetch(env.NIS_IFORTE_TICKETS_URL, {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${env.NIS_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil tiket iForte: ${response.statusText}`);
  }

  await job.updateProgress(30);

  const responseData = (await response.json()) as { results?: IforteTicket[] };
  const tickets: IforteTicket[] = responseData.results || [];

  if (tickets.length === 0) {
    await job.log("[Worker] Tidak ada data tiket iForte.");
    await job.updateProgress(100);
    return {
      sent: false,
      totalTickets: 0,
      message: "Tidak ada data tiket iForte.",
    };
  }

  const openTickets = tickets.filter((t) => t.ticket_status === "Open");

  if (openTickets.length === 0) {
    await job.log("[Worker] Tidak ada tiket iForte yang berstatus Open.");
    await job.updateProgress(100);
    return {
      sent: false,
      totalTickets: 0,
      message: "Tidak ada tiket iForte yang berstatus Open.",
    };
  }

  // Sort tickets: AC first, then by age (oldest first)
  openTickets.sort((a, b) => {
    if (a.subscription_status === "AC" && b.subscription_status !== "AC") return -1;
    if (a.subscription_status !== "AC" && b.subscription_status === "AC") return 1;

    return new Date(a.insert_time).getTime() - new Date(b.insert_time).getTime();
  });

  const messageLines = openTickets.map((ticket, index) => {
    const insertDate = new Date(ticket.insert_time);
    const ageHours = Math.floor((Date.now() - insertDate.getTime()) / (1000 * 3600));

    let alertIcon = "";
    if (ageHours >= 24) {
      alertIcon = "🚨";
    } else if (ageHours >= 18) {
      alertIcon = "⚠️";
    }

    const acIcon = ticket.subscription_status === "AC" ? "💎" : "";

    let durationText = `${ageHours} jam`;
    if (ageHours >= 48) {
      const days = Math.floor(ageHours / 24);
      durationText = `${days}+ hari`;
    }

    return `${index + 1}. ${alertIcon}${acIcon}${ticket.customer_id}:${ticket.subscriber_id} ${ticket.subscriber_name} ${ticket.ticket_subject} ${durationText}`;
  });

  const fullMessage = `rekan iforte, mohon dibantu tindak lanjut tiket berikut ini:\n\n${messageLines.join("\n")}`;

  const recipient = job.data?.to ?? env.WA_IFORTE_TARGET_NUMBER;

  await job.updateProgress(60);
  await job.log(`[Worker] Mengirim ${openTickets.length} reminder tiket iForte ke WhatsApp (${recipient})...`);

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
  await job.log("[Worker] Berhasil mengirim reminder tiket iForte via WhatsApp.");

  return {
    sent: true,
    totalTickets: openTickets.length,
    recipient,
    sentAt: new Date().toISOString(),
  };
}

export function createIforteReminderWorker(
  options?: Partial<WorkerOptions>
): Worker<IforteReminderJobData, IforteReminderJobResult> {
  const isTest = process.env.NODE_ENV === "test";
  return new Worker<IforteReminderJobData, IforteReminderJobResult>(
    IFORTE_REMINDER_QUEUE_NAME,
    iforteReminderProcessor,
    {
      connection: getRedisConnection() as any,
      concurrency: env.DEFAULT_WORKER_CONCURRENCY,
      autorun: isTest ? false : true,
      ...options,
    }
  );
}
