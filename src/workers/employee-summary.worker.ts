import { Worker, type Job, type WorkerOptions } from "bullmq";
import { getRedisConnection } from "../config/redis";
import { env } from "../config/env";
import { EMPLOYEE_SUMMARY_QUEUE_NAME } from "../queues/employee-summary.queue";
import type { EmployeeSummaryJobData, EmployeeSummaryJobResult } from "../shared/types";

export { EMPLOYEE_SUMMARY_QUEUE_NAME };

interface EmployeeSummary {
  employee_id: string;
  name: string;
  total_tickets: number;
  tickets: number[];
}

function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split("T")[0];
}

export async function employeeSummaryProcessor(
  job: Job<EmployeeSummaryJobData, EmployeeSummaryJobResult>
): Promise<EmployeeSummaryJobResult> {
  const targetDate = job.data.targetDate ?? job.data.target_date ?? getYesterdayDate();
  const departmentId =
    job.data.departmentId ?? job.data.department_id ?? env.DEFAULT_DEPARTMENT_ID;
  const excludedEmployeeIds =
    job.data.excludedEmployeeIds ??
    job.data.excluded_employee_ids ??
    env.DEFAULT_EXCLUDED_EMPLOYEE_IDS;
  const targetNumber = job.data.to || env.WA_TICKET_SUMMARY_TARGET_NUMBER;

  await job.updateProgress(10);
  await job.log(`Mulai mengambil data summary tiket karyawan untuk tanggal ${targetDate}...`);

  const url = new URL(env.NIS_EMPLOYEE_SUMMARY_URL);
  url.searchParams.set("target_date", targetDate);
  url.searchParams.set("department_id", departmentId.toString());
  if (excludedEmployeeIds) {
    url.searchParams.set("excluded_employee_ids", excludedEmployeeIds);
  }

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${env.NIS_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil summary tiket: ${response.statusText}`);
  }

  await job.updateProgress(40);
  const responseData = (await response.json()) as { results?: EmployeeSummary[] };
  const employees: EmployeeSummary[] = responseData.results || [];

  if (employees.length === 0) {
    await job.updateProgress(100);
    await job.log("Tidak ada data summary tiket karyawan.");
    return {
      sent: false,
      targetDate,
      totalTickets: 0,
      totalEmployees: 0,
      message: "Tidak ada data summary tiket karyawan.",
    };
  }

  await job.updateProgress(60);

  const messageLines = employees.map((emp, index) => {
    let alertIcon = "";
    if (emp.total_tickets >= 7) {
      alertIcon = "💎";
    }

    const ticketList = (emp.tickets || []).join(", ");
    return `${index + 1}. ${alertIcon}${emp.name} (${emp.total_tickets} tiket)\n   ${ticketList}`;
  });

  const totalTickets = employees.reduce((sum, emp) => sum + (emp.total_tickets || 0), 0);

  const fullMessage =
    `📊 Summary Tiket Karyawan - ${targetDate}\n` +
    `Total: ${totalTickets} tiket, ${employees.length} karyawan\n\n` +
    `${messageLines.join("\n")}`;

  await job.updateProgress(80);
  await job.log(`Mengirim summary ${employees.length} karyawan ke WhatsApp ${targetNumber}...`);

  const waResponse = await fetch(env.WA_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WA_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: targetNumber,
      body: "text",
      text: fullMessage,
    }),
  });

  if (!waResponse.ok) {
    const errorText = await waResponse.text();
    throw new Error(`Gagal mengirim WhatsApp: ${waResponse.statusText} - ${errorText}`);
  }

  await job.updateProgress(100);
  await job.log(
    `Berhasil mengirim summary ${employees.length} karyawan (${totalTickets} tiket) ke WhatsApp: ${targetNumber}`
  );

  return {
    sent: true,
    targetDate,
    totalTickets,
    totalEmployees: employees.length,
    recipient: targetNumber,
    sentAt: new Date().toISOString(),
  };
}

export function createEmployeeSummaryWorker(
  options?: Partial<WorkerOptions>
): Worker<EmployeeSummaryJobData, EmployeeSummaryJobResult> {
  return new Worker<EmployeeSummaryJobData, EmployeeSummaryJobResult>(
    EMPLOYEE_SUMMARY_QUEUE_NAME,
    employeeSummaryProcessor,
    {
      connection: getRedisConnection(),
      concurrency: env.DEFAULT_WORKER_CONCURRENCY,
      ...options,
    }
  );
}
