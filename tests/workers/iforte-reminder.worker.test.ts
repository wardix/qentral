import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  iforteReminderProcessor,
  createIforteReminderWorker,
  IFORTE_REMINDER_QUEUE_NAME,
} from "../../src/workers/iforte-reminder.worker";
import { env } from "../../src/config/env";

describe("iForte Reminder Worker & Processor", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("Case 1 (Happy Path): should fetch tickets from NIS, filter Open, prioritize AC, format message, send to WA API, and return success", async () => {
    const now = Date.now();
    // Ticket 1: 30 hours old, status Open, non-AC
    const insertTime1 = new Date(now - 30 * 3600 * 1000).toISOString();
    // Ticket 2: 20 hours old, status Open, AC (should come first due to AC)
    const insertTime2 = new Date(now - 20 * 3600 * 1000).toISOString();
    // Ticket 3: Closed ticket (should be ignored)
    const insertTime3 = new Date(now - 50 * 3600 * 1000).toISOString();

    const fakeNisResponse = {
      results: [
        {
          ticket_id: 101,
          insert_time: insertTime1,
          ticket_status: "Open",
          customer_id: "CUST-A",
          subscriber_id: 1001,
          subscription_status: "ACTIVE",
          subscriber_name: "Customer Satu",
          ticket_subject: "BGP Session Down",
        },
        {
          ticket_id: 102,
          insert_time: insertTime2,
          ticket_status: "Open",
          customer_id: "CUST-B",
          subscriber_id: 1002,
          subscription_status: "AC",
          subscriber_name: "Customer Dua AC",
          ticket_subject: "Link Down Fiber",
        },
        {
          ticket_id: 103,
          insert_time: insertTime3,
          ticket_status: "Closed",
          customer_id: "CUST-C",
          subscriber_id: 1003,
          subscription_status: "AC",
          subscriber_name: "Customer Tiga Closed",
          ticket_subject: "Resolved Incident",
        },
      ],
    };

    let waRequestPayload: any = null;
    let nisRequestHeaders: any = null;

    globalThis.fetch = mock(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr === env.NIS_IFORTE_TICKETS_URL) {
        nisRequestHeaders = init?.headers;
        return new Response(JSON.stringify(fakeNisResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr === env.WA_API_URL) {
        waRequestPayload = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ status: "success", message_id: "wa-iforte-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const updateProgressMock = mock(async (_progress: number) => {});
    const logMock = mock(async (_message: string) => {});

    const mockJob = {
      id: "iforte-job-1",
      name: "send-iforte-reminder",
      data: {},
      updateProgress: updateProgressMock,
      log: logMock,
    };

    const result = await iforteReminderProcessor(mockJob as any);

    // NIS request authorization check
    expect(nisRequestHeaders?.Authorization).toBe(`Bearer ${env.NIS_TOKEN}`);

    // WA dispatch verification
    expect(waRequestPayload).not.toBeNull();
    expect(waRequestPayload.to).toBe(env.WA_IFORTE_TARGET_NUMBER);
    expect(waRequestPayload.body).toBe("text");
    expect(waRequestPayload.text).toContain("rekan iforte, mohon dibantu tindak lanjut tiket berikut ini:");

    // AC ticket comes first (Ticket 2, 20h -> ⚠️, 💎)
    expect(waRequestPayload.text).toContain("1. ⚠️💎CUST-B:1002 Customer Dua AC Link Down Fiber 20 jam");
    // Non-AC ticket comes second (Ticket 1, 30h -> 🚨)
    expect(waRequestPayload.text).toContain("2. 🚨CUST-A:1001 Customer Satu BGP Session Down 30 jam");

    // Result verification
    expect(result.sent).toBe(true);
    expect(result.totalTickets).toBe(2);
    expect(result.recipient).toBe(env.WA_IFORTE_TARGET_NUMBER);
    expect(result.sentAt).toBeDefined();

    // Progress checkpoints
    expect(updateProgressMock).toHaveBeenCalled();
    expect(logMock).toHaveBeenCalled();
  });

  it("Case 2 (No Tickets / No Open Tickets): should early return and not call WA API", async () => {
    let waCalled = false;
    globalThis.fetch = mock(async (url: any) => {
      const urlStr = String(url);
      if (urlStr === env.NIS_IFORTE_TICKETS_URL) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (urlStr === env.WA_API_URL) {
        waCalled = true;
        return new Response("OK", { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const mockJob = {
      id: "iforte-job-2",
      name: "send-iforte-reminder",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    const result = await iforteReminderProcessor(mockJob as any);

    expect(result.sent).toBe(false);
    expect(result.totalTickets).toBe(0);
    expect(waCalled).toBe(false);
  });

  it("Case 3 (Custom Recipient Override): should use data.to if provided in payload", async () => {
    const fakeNisResponse = {
      results: [
        {
          ticket_id: 201,
          insert_time: new Date().toISOString(),
          ticket_status: "Open",
          customer_id: "CUST-X",
          subscriber_id: 555,
          subscription_status: "REGULAR",
          subscriber_name: "Customer X",
          ticket_subject: "Minor Issue",
        },
      ],
    };

    let sentTo = "";
    globalThis.fetch = mock(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr === env.NIS_IFORTE_TICKETS_URL) {
        return new Response(JSON.stringify(fakeNisResponse), { status: 200 });
      }
      if (urlStr === env.WA_API_URL) {
        const parsed = JSON.parse(init?.body as string);
        sentTo = parsed.to;
        return new Response(JSON.stringify({ status: "success" }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const customRecipient = "628999888777@s.whatsapp.net";
    const mockJob = {
      id: "iforte-job-3",
      name: "send-iforte-reminder",
      data: { to: customRecipient },
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    const result = await iforteReminderProcessor(mockJob as any);

    expect(sentTo).toBe(customRecipient);
    expect(result.recipient).toBe(customRecipient);
  });

  it("Case 4 (NIS API Failure): should throw error when NIS endpoint fails", async () => {
    globalThis.fetch = mock(async (url: any) => {
      const urlStr = String(url);
      if (urlStr === env.NIS_IFORTE_TICKETS_URL) {
        return new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const mockJob = {
      id: "iforte-job-4",
      name: "send-iforte-reminder",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    expect(iforteReminderProcessor(mockJob as any)).rejects.toThrow("Gagal mengambil tiket iForte");
  });

  it("Case 5 (WhatsApp Failure): should throw error when WhatsApp API returns non-200", async () => {
    const fakeNisResponse = {
      results: [
        {
          ticket_id: 301,
          insert_time: new Date().toISOString(),
          ticket_status: "Open",
          customer_id: "CUST-Y",
          subscriber_id: 777,
          subscription_status: "ACTIVE",
          subscriber_name: "Customer Y",
          ticket_subject: "Major Outage",
        },
      ],
    };

    globalThis.fetch = mock(async (url: any) => {
      const urlStr = String(url);
      if (urlStr === env.NIS_IFORTE_TICKETS_URL) {
        return new Response(JSON.stringify(fakeNisResponse), { status: 200 });
      }
      if (urlStr === env.WA_API_URL) {
        return new Response("Unauthorized Gateway", { status: 401, statusText: "Unauthorized" });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const mockJob = {
      id: "iforte-job-5",
      name: "send-iforte-reminder",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    expect(iforteReminderProcessor(mockJob as any)).rejects.toThrow("Gagal mengirim WhatsApp");
  });

  it("should create Worker instance with correct queue name and options", async () => {
    const worker = createIforteReminderWorker();
    expect(worker).toBeDefined();
    expect(worker.name).toBe(IFORTE_REMINDER_QUEUE_NAME);
    await worker.close();
  });
});
