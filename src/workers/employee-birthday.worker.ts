import { Worker, type WorkerOptions, type Job } from "bullmq";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { getRedisConnection } from "../config/redis";
import { env } from "../config/env";
import { EMPLOYEE_BIRTHDAY_QUEUE_NAME } from "../queues/employee-birthday.queue";

export { EMPLOYEE_BIRTHDAY_QUEUE_NAME };

export interface EmployeeBirthdayJobData {
  referenceDate?: string;
  recipients?: string[];
  notify?: string | string[];
  ccPhones?: string[];
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
  mobile_phone?: string;
  whatsapp?: string;
  status_join?: string;
  job_position?: string;
  organization_name?: string;
  [key: string]: any;
}

export interface RenderVoucherOptions {
  templatePath?: string;
  name: string;
  endPeriodDate: Date;
}

export function formatPhoneNumber(phoneNumber?: string): string {
  if (!phoneNumber) return "";
  const digitsOnly = phoneNumber.replace(/[^0-9]/g, "");
  return digitsOnly.startsWith("0") ? "62" + digitsOnly.substring(1) : digitsOnly;
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

export function filterTodayBirthdays(
  employees: NusaworkEmployee[],
  referenceDate?: Date
): NusaworkEmployee[] {
  const today = referenceDate ? new Date(referenceDate) : new Date();
  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
  });
  const ddmmToday = formatter.format(today);

  return employees
    .filter((employee) => employee.status_join !== "Internship")
    .filter((employee) => {
      if (!employee.date_of_birth) return false;
      const birthDate = new Date(`${employee.date_of_birth}T00:00:00`);
      return ddmmToday === formatter.format(birthDate);
    });
}

export async function renderBirthdayVoucher(
  options: RenderVoucherOptions
): Promise<Buffer> {
  const templatePath = options.templatePath || env.BIRTHDAY_GIFT_VOUCHER_TEMPLATE_PATH;
  const { name, endPeriodDate } = options;

  const textNameAreaX = 4;
  const textNameAreaY = 460;
  const textNameAreaWidth = 736;
  const textNameAreaHeight = 100;
  const textNameFontSize = 68;

  const textEndPeriodX = 68;
  const textEndPeriodY = 1020;
  const textEndPeriodWidth = 398;
  const textEndPeriodFontSize = 32;

  const formattedEndPeriodDate = endPeriodDate.toLocaleString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const image = await loadImage(templatePath);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");

  context.drawImage(image, 0, 0);

  let fontSize = textNameFontSize;
  context.font = `bold ${fontSize}px sans-serif`;
  context.fillStyle = "#FFD533";

  let textMetrics = context.measureText(name);
  let textWidth = textMetrics.width;

  while (textWidth > textNameAreaWidth && fontSize > 10) {
    fontSize -= 2;
    context.font = `bold ${fontSize}px sans-serif`;
    textMetrics = context.measureText(name);
    textWidth = textMetrics.width;
  }

  context.fillText(
    name,
    textNameAreaX + (textNameAreaWidth - textWidth) / 2,
    textNameAreaY + (textNameAreaHeight + fontSize) / 2
  );

  context.font = `bold ${textEndPeriodFontSize}px sans-serif`;
  context.fillStyle = "#FFFFFF";
  textWidth = context.measureText(formattedEndPeriodDate).width;
  context.fillText(
    formattedEndPeriodDate,
    textEndPeriodX + (textEndPeriodWidth - textWidth) / 2,
    textEndPeriodY
  );

  return canvas.toBuffer("image/png");
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

export async function sendWaImage(
  to: string,
  imageBase64: string,
  caption: string
): Promise<void> {
  const safeTo = to.endsWith("@c.us") ? to.replace("@c.us", "") : to;
  const res = await fetch(env.WA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.WA_API_TOKEN}`,
    },
    body: JSON.stringify({
      to: safeTo,
      body: "image",
      image: imageBase64,
      caption,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal mengirim WhatsApp ke ${safeTo}: ${res.statusText}${errText ? ` - ${errText}` : ""}`);
  }
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

  const isDailyVoucher =
    job.name === "daily-voucher" ||
    job.name === "send-voucher" ||
    job.name === "sendGiftVoucherToBirthdayEmployees";

  if (isDailyVoucher) {
    // 2. Filter yang ultah hari ini
    const todayEmployees = filterTodayBirthdays(employees, refDate);

    if (todayEmployees.length === 0) {
      await job.updateProgress(100);
      await job.log("[Birthday] Tidak ada karyawan yang berulang tahun hari ini.");
      return {
        sent: false,
        totalEmployees: 0,
        message: "Tidak ada karyawan yang berulang tahun hari ini",
      };
    }

    const ccPhones =
      job.data?.ccPhones ||
      resolveRecipientPhones(job.data);

    await job.updateProgress(60);
    await job.log(`[Birthday] Mengirim voucher untuk ${todayEmployees.length} karyawan ultah hari ini`);

    const voucherPeriodDays = env.BIRTHDAY_GIFT_VOUCHER_PERIOD_DAYS;
    const endPeriodDate = new Date(refDate.getTime() + 86400000 * voucherPeriodDays);

    const sentRecipients: string[] = [];

    for (const emp of todayEmployees) {
      const voucherBuffer = await renderBirthdayVoucher({
        name: emp.full_name,
        endPeriodDate,
      });
      const imageBase64 = voucherBuffer.toString("base64");

      const contactNo = formatPhoneNumber(emp.whatsapp || emp.mobile_phone);
      if (contactNo) {
        await sendWaImage(contactNo, imageBase64, env.BIRTHDAY_WISHES);
        sentRecipients.push(contactNo);
      }

      for (const ccPhone of ccPhones) {
        await sendWaImage(ccPhone, imageBase64, env.BIRTHDAY_WISHES);
        sentRecipients.push(ccPhone);
      }
    }

    await job.updateProgress(100);
    await job.log("[Birthday] Berhasil mengirimkan voucher ulang tahun hari ini.");

    return {
      sent: true,
      totalEmployees: todayEmployees.length,
      recipients: sentRecipients,
      sentAt: new Date().toISOString(),
    };
  }

  // Handle upcoming-reminder
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

  // Urutkan karyawan secara kronologis
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

  // Format pesan teks dengan header "Upcoming birthday:"
  const fullMessage = formatUpcomingBirthdayMessage(matched);

  // Selesaikan nomor target penerima notifikasi
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
