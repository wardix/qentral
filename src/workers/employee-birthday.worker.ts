import { Worker, type WorkerOptions, type Job } from "bullmq";
import { getRedisConnection } from "../config/redis";
import { env } from "../config/env";
import { EMPLOYEE_BIRTHDAY_QUEUE_NAME } from "../queues/employee-birthday.queue";

export { EMPLOYEE_BIRTHDAY_QUEUE_NAME };

export interface EmployeeBirthdayJobData {
  referenceDate?: string;
  recipients?: string[];
  notify?: string | string[];
}

export interface EmployeeBirthdayJobResult {
  sent: boolean;
  totalEmployees: number;
  recipients?: string[];
  message?: string;
  sentAt?: string;
}

export interface NusaworkEmployee {
  employee_id: string;
  full_name: string;
  date_of_birth: string;
  status_join?: string;
  job_position?: string;
  organization_name?: string;
  [key: string]: any;
}

export function getUpcomingDateRange(referenceDate?: Date): string[] {
  const dayMap: Record<string, number> = {
    Minggu: 0,
    Senin: 1,
    Selasa: 2,
    Rabu: 3,
    Kamis: 4,
    Jumat: 5,
    Sabtu: 6,
  };
  const longDayFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
  });
  const ddmmFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
  });

  const today = referenceDate ? new Date(referenceDate) : new Date();
  const dayName = longDayFormatter.format(today);
  const currentDayIdx = dayMap[dayName] ?? today.getDay();
  const nextWeekDiffDays = 7 - currentDayIdx;

  const upcomingDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today.getTime() + (nextWeekDiffDays + i) * 86400000);
    upcomingDates.push(ddmmFormatter.format(date));
  }
  return upcomingDates;
}

export function filterUpcomingBirthdays(
  employees: NusaworkEmployee[],
  referenceDate?: Date
): NusaworkEmployee[] {
  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
  });
  const upcomingDates = getUpcomingDateRange(referenceDate);

  return employees
    .filter((employee) => employee.status_join !== "Internship")
    .filter((employee) => {
      if (!employee.date_of_birth) return false;
      const birthDate = new Date(`${employee.date_of_birth}T00:00:00`);
      return upcomingDates.some((date) => date === formatter.format(birthDate));
    });
}

export function formatUpcomingBirthdayMessage(employees: NusaworkEmployee[]): string {
  const notifLines = employees.map(
    (e) => `${e.date_of_birth.substring(5)} ${e.full_name}`
  );
  return `Upcoming birthday:\n${notifLines.join("\n")}`;
}

export async function getNusaworkToken(): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.NUSAWORK_CLIENT_ID,
    client_secret: env.NUSAWORK_CLIENT_SECRET,
  });

  const res = await fetch(env.NUSAWORK_TOKEN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Gagal mendapatkan token Nusawork: ${res.statusText}`);
  }

  const data = (await res.json()) as { access_token?: string; token?: string };
  const token = data.access_token || data.token;
  if (!token) {
    throw new Error("Token Nusawork tidak ditemukan dalam response");
  }
  return token;
}

export async function fetchNusaworkEmployees(token: string): Promise<NusaworkEmployee[]> {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const formattedToday = `${yyyy}-${mm}-${dd}`;

  const payload = {
    fields: {
      active_status: ["active"],
    },
    page_count: 10000,
    currentPage: 1,
    periods: [formattedToday, formattedToday],
  };

  const res = await fetch(env.NUSAWORK_EMPLOYEE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil data karyawan Nusawork: ${res.statusText}`);
  }

  const data = (await res.json()) as any;
  return data?.data?.list || [];
}

export function resolveRecipientPhones(jobData?: EmployeeBirthdayJobData): string[] {
  if (Array.isArray(jobData?.recipients) && jobData.recipients.length > 0) {
    return jobData.recipients;
  }
  if (jobData?.notify) {
    return Array.isArray(jobData.notify) ? jobData.notify : [jobData.notify];
  }

  const rawPhones = env.BIRTHDAY_PIC_PHONES;
  if (!rawPhones || rawPhones.trim() === "") return [];

  try {
    const parsed = JSON.parse(rawPhones);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    return rawPhones.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return [];
}

export async function employeeBirthdayProcessor(
  job: Job<EmployeeBirthdayJobData, EmployeeBirthdayJobResult>
): Promise<EmployeeBirthdayJobResult> {
  await job.updateProgress(10);
  await job.log(`[Birthday] Memproses reminder ulang tahun, Job ID: ${job.id}`);

  const refDate = job.data?.referenceDate ? new Date(job.data.referenceDate) : new Date();

  // 1. Ambil token & data karyawan dari Nusawork
  const token = await getNusaworkToken();
  await job.updateProgress(30);

  const employees = await fetchNusaworkEmployees(token);
  await job.updateProgress(50);
  await job.log(`[Birthday] Mengambil ${employees.length} data karyawan aktif dari Nusawork`);

  // 2. Filter karyawan yang berulang tahun minggu depan
  const matched = filterUpcomingBirthdays(employees, refDate);

  if (matched.length === 0) {
    await job.updateProgress(100);
    await job.log("[Birthday] Tidak ada karyawan yang berulang tahun di minggu depan.");
    return {
      sent: false,
      totalEmployees: 0,
      message: "Tidak ada karyawan yang berulang tahun minggu depan",
    };
  }

  // 3. Urutkan karyawan secara kronologis
  const currentYear = refDate.getFullYear();
  matched.sort((a, b) => {
    const aBirthday = new Date(a.date_of_birth);
    const bBirthday = new Date(b.date_of_birth);

    aBirthday.setFullYear(currentYear);
    bBirthday.setFullYear(currentYear);

    if (aBirthday < refDate) {
      aBirthday.setFullYear(currentYear + 1);
    }
    if (bBirthday < refDate) {
      bBirthday.setFullYear(currentYear + 1);
    }

    return aBirthday.getTime() - bBirthday.getTime();
  });

  // 4. Format pesan teks dengan header "Upcoming birthday:"
  const fullMessage = formatUpcomingBirthdayMessage(matched);

  // 5. Selesaikan nomor target penerima notifikasi
  const targetRecipients = resolveRecipientPhones(job.data);

  await job.updateProgress(70);
  await job.log(`[Birthday] Mengirim notifikasi untuk ${matched.length} karyawan ke ${targetRecipients.length} penerima`);

  for (const recipient of targetRecipients) {
    const safeTo = recipient.endsWith("@c.us") ? recipient.replace("@c.us", "") : recipient;
    const waResponse = await fetch(env.WA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.WA_API_TOKEN}`,
      },
      body: JSON.stringify({
        to: safeTo,
        body: "text",
        text: fullMessage,
      }),
    });

    if (!waResponse.ok) {
      const errText = await waResponse.text();
      throw new Error(`Gagal mengirim WhatsApp ke ${safeTo}: ${waResponse.statusText}${errText ? ` - ${errText}` : ""}`);
    }
  }

  await job.updateProgress(100);
  await job.log("[Birthday] Pengiriman pengingat ulang tahun minggu depan berhasil diselesaikan.");

  return {
    sent: true,
    totalEmployees: matched.length,
    recipients: targetRecipients,
    sentAt: new Date().toISOString(),
  };
}

export function createEmployeeBirthdayWorker(
  options?: Partial<WorkerOptions>
): Worker<EmployeeBirthdayJobData, EmployeeBirthdayJobResult> {
  const isTest = process.env.NODE_ENV === "test";
  return new Worker<EmployeeBirthdayJobData, EmployeeBirthdayJobResult>(
    EMPLOYEE_BIRTHDAY_QUEUE_NAME,
    employeeBirthdayProcessor,
    {
      connection: getRedisConnection() as any,
      concurrency: env.DEFAULT_WORKER_CONCURRENCY,
      autorun: isTest ? false : true,
      ...options,
    }
  );
}
