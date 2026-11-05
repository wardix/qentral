import { Worker, type Job, type WorkerOptions } from "bullmq";
import { getRedisConnection } from "../config/redis";
import { env } from "../config/env";
import { NUSACONTACT_CONTACT_SYNC_QUEUE_NAME } from "../queues/nusacontact-contact-sync.queue";
import type {
  NusacontactSyncJobData,
  NusacontactSyncJobResult,
} from "../shared/types";

export { NUSACONTACT_CONTACT_SYNC_QUEUE_NAME };

export interface CallerIdSubscriber {
  subscriber_id: string;
  service?: string;
  account?: string;
  address?: string;
}

export interface CallerIdCustomer {
  customer_id: string;
  company?: string;
  branch?: string;
  subscribers?: CallerIdSubscriber[];
}

export interface CallerIdContact {
  name: string;
  salutation?: string;
  phone: string;
}

export interface CallerIdData {
  contact?: CallerIdContact | null;
  customers?: CallerIdCustomer[];
  error?: string;
}

export interface NusacontactPayload {
  phone_number: string;
  name: string;
  timezone: string;
  branch_code: string;
  attributes: string;
}

const CUSTOMER_ID_LINK_PREFIX = "https://isx.nusa.net.id/customer.php?custId=";
const CUSTOMER_ID_LINK_SUFFIX = "&pid=profile&module=customer";
const SUBSCRIPTION_ID_LINK_PREFIX = "https://isx.nusa.net.id/v2/customer/service/";
const SUBSCRIPTION_ID_LINK_SUFFIX = "/detail";

export function transformCallerIdToNusacontact(data: CallerIdData): NusacontactPayload {
  const phoneNumber = data.contact?.phone || "";
  const name = data.contact?.name || "";
  const salutation = data.contact?.salutation || "";

  const branches: string[] = [];
  const ids: string[] = [];
  const companies: Array<{ id: string; name: string }> = [];
  const services: Array<{ id: string; name: string }> = [];
  const accounts: Array<{ id: string; name: string }> = [];
  const addresses: Array<{ id: string; name: string }> = [];

  for (const c of data.customers || []) {
    if (c.customer_id) {
      ids.push(c.customer_id);
    }
    if (c.company && c.company.trim()) {
      companies.push({ id: c.customer_id, name: c.company.trim() });
    }
    if (c.branch && !branches.includes(c.branch)) {
      branches.push(c.branch);
    }

    for (const sub of c.subscribers || []) {
      if (sub.service && sub.service.trim()) {
        services.push({ id: sub.subscriber_id, name: sub.service.trim() });
      }
      if (sub.account && sub.account.trim()) {
        accounts.push({ id: sub.subscriber_id, name: sub.account.trim() });
      }
      if (sub.address && sub.address.trim()) {
        addresses.push({
          id: sub.subscriber_id,
          name: sub.address.trim().replace(/\s+/g, " "),
        });
      }
    }
  }

  const attributes: any = {
    salutation,
    ids: ids
      .map((id) => `[${id}](${CUSTOMER_ID_LINK_PREFIX}${id}${CUSTOMER_ID_LINK_SUFFIX})`)
      .join(", "),
    companies: companies
      .map(
        (comp) => `[${comp.name}](${CUSTOMER_ID_LINK_PREFIX}${comp.id}${CUSTOMER_ID_LINK_SUFFIX})`
      )
      .join(", "),
  };

  if (services.length > 0) {
    attributes.services = services
      .map((s) => `[${s.name}](${SUBSCRIPTION_ID_LINK_PREFIX}${s.id}${SUBSCRIPTION_ID_LINK_SUFFIX})`)
      .join(", ");
  }

  if (accounts.length > 0) {
    attributes.accounts = accounts
      .map((a) => `[${a.name}](${SUBSCRIPTION_ID_LINK_PREFIX}${a.id}${SUBSCRIPTION_ID_LINK_SUFFIX})`)
      .join(", ");
  }

  if (addresses.length > 0) {
    attributes.addresses = addresses
      .map(
        (addr) => `[${addr.name}](${SUBSCRIPTION_ID_LINK_PREFIX}${addr.id}${SUBSCRIPTION_ID_LINK_SUFFIX})`
      )
      .join(", ");
  }

  return {
    phone_number: phoneNumber,
    name,
    timezone: branches.includes("062") ? "Asia/Makassar" : "Asia/Jakarta",
    branch_code: branches.join(", "),
    attributes: JSON.stringify(attributes),
  };
}

export async function nusacontactContactSyncProcessor(
  job: Job<NusacontactSyncJobData, NusacontactSyncJobResult>
): Promise<NusacontactSyncJobResult> {
  const rawPhone =
    job.data.phone ?? job.data.phoneNumber ?? job.data.phone_number ?? "";
  const phone = String(rawPhone).trim().replace(/\s+/g, "");

  await job.updateProgress(5);
  await job.log(`[Worker] Memulai sinkronisasi kontak Nusacontact untuk nomor: ${phone}`);

  if (phone.length < 10) {
    await job.log(`[Worker] Nomor telepon '${phone}' tidak valid (kurang dari 10 digit).`);
    await job.updateProgress(100);
    return {
      success: false,
      synced: false,
      phone,
      message: `Nomor telepon tidak valid (minimal 10 digit): ${phone}`,
    };
  }

  await job.updateProgress(20);
  const callerIdUrl = new URL(env.NIS_CALLER_ID_URL);
  callerIdUrl.searchParams.set("phone", phone);

  await job.log(`[Worker] Mengambil data caller-id dari NIS Gateway: ${callerIdUrl.toString()}`);
  const gatewayResponse = await fetch(callerIdUrl.toString(), {
    headers: {
      Authorization: `Bearer ${env.NIS_TOKEN}`,
      Accept: "application/json",
    },
  });

  if (gatewayResponse.status === 404) {
    await job.log(`[Worker] Kontak tidak ditemukan di NIS Gateway (404).`);
    await job.updateProgress(100);
    return {
      success: true,
      synced: false,
      phone,
      message: `Kontak tidak ditemukan di NIS Gateway untuk nomor: ${phone}`,
    };
  }

  if (!gatewayResponse.ok) {
    const errorBody = await gatewayResponse.text();
    throw new Error(
      `Gagal mengambil data caller-id NIS: ${gatewayResponse.status} ${gatewayResponse.statusText}. ${errorBody}`
    );
  }

  const callerIdData = (await gatewayResponse.json()) as CallerIdData;
  if (!callerIdData.contact || !callerIdData.contact.name) {
    await job.log(`[Worker] Kontak tidak memiliki data identitas di NIS Gateway.`);
    await job.updateProgress(100);
    return {
      success: true,
      synced: false,
      phone,
      message: `Kontak tidak ditemukan di NIS Gateway untuk nomor: ${phone}`,
    };
  }

  await job.updateProgress(50);
  const payload = transformCallerIdToNusacontact(callerIdData);

  await job.log(`[Worker] Mengirim kontak '${payload.name}' ke API Nusacontact: ${env.NUSACONTACT_SYNC_URL}`);
  const syncResponse = await fetch(env.NUSACONTACT_SYNC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": env.NUSACONTACT_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!syncResponse.ok) {
    const syncError = await syncResponse.text();
    throw new Error(
      `Gagal sinkronisasi kontak ke Nusacontact: ${syncResponse.status} ${syncResponse.statusText}. ${syncError}`
    );
  }

  await job.updateProgress(100);
  await job.log(`[Worker] Berhasil menyinkronkan kontak '${payload.name}' ke Nusacontact.`);

  return {
    success: true,
    synced: true,
    phone,
    name: payload.name,
    branches: payload.branch_code ? payload.branch_code.split(", ") : [],
    message: "Berhasil menyinkronkan kontak ke Nusacontact",
    syncedAt: new Date().toISOString(),
  };
}

export function createNusacontactContactSyncWorker(
  options?: Partial<WorkerOptions>
): Worker<NusacontactSyncJobData, NusacontactSyncJobResult> {
  const isTest = process.env.NODE_ENV === "test";
  return new Worker<NusacontactSyncJobData, NusacontactSyncJobResult>(
    NUSACONTACT_CONTACT_SYNC_QUEUE_NAME,
    nusacontactContactSyncProcessor,
    {
      connection: getRedisConnection() as any,
      concurrency: env.DEFAULT_WORKER_CONCURRENCY,
      autorun: isTest ? false : true,
      ...options,
    }
  );
}
