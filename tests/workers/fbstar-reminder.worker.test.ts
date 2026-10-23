import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  fbstarReminderProcessor,
  createFbstarReminderWorker,
  FBSTAR_REMINDER_QUEUE_NAME,
} from "../../src/workers/fbstar-reminder.worker";
import { env } from "../../src/config/env";

describe("FBStar Reminder Worker & Processor", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset any state before each test
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("Case 1 (Happy Path): should parse metrics, format message, send to WA API, and return success", async () => {
    const fakePrometheusMetrics = `
# HELP operator_ticket_created_timestamp_seconds Timestamp
# TYPE operator_ticket_created_timestamp_seconds gauge
operator_ticket_created_timestamp_seconds{category="BGP_DOWN",circuit_id="CR-101",operator="fbstar",ticket_number="TK-001"} 1700000000
operator_ticket_created_timestamp_seconds{category="LINK_DOWN",circuit_id="CR-102",operator="fbstar",ticket_number="TK-002"} 1700010000
operator_ticket_created_timestamp_seconds{category="OTHER",circuit_id="CR-999",operator="other_op",ticket_number="TK-999"} 1700000000
operator_ticket_created_timestamp_seconds{category="TEST",circuit_id="CR-PEND",operator="fbstar",ticket_number="pending"} 1700000000
`;

    let waRequestPayload: any = null;
    let waRequestHeaders: any = null;

    globalThis.fetch = mock(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr === env.PROM_TICKETS_URL) {
        return new Response(fakePrometheusMetrics, { status: 200 });
      }
      if (urlStr === env.WA_API_URL) {
        waRequestPayload = JSON.parse(init?.body as string);
        waRequestHeaders = init?.headers;
        return new Response(JSON.stringify({ status: "success", message_id: "wa-msg-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const updateProgressMock = mock(async (_progress: number) => {});
    const logMock = mock(async (_message: string) => {});

    const mockJob = {
      id: "fbstar-job-1",
      name: "send-fbstar-reminder",
      data: {},
      updateProgress: updateProgressMock,
      log: logMock,
    };

    const result = await fbstarReminderProcessor(mockJob as any);

    expect(result.sent).toBe(true);
    expect(result.totalTickets).toBe(2);
    expect(result.recipient).toBe(env.WA_FBSTAR_TARGET_NUMBER);
    expect(result.sentAt).toBeDefined();

    // Verify WA request
    expect(waRequestPayload).toBeDefined();
    expect(waRequestPayload.to).toBe(env.WA_FBSTAR_TARGET_NUMBER);
    expect(waRequestPayload.body).toBe("text");
    expect(waRequestPayload.text).toContain("rekan fiberstar, mohon dibantu tindak lanjut tiket berikut ini:");
    expect(waRequestPayload.text).toContain("TK-001");
    expect(waRequestPayload.text).toContain("TK-002");
    expect(waRequestPayload.text).not.toContain("TK-999"); // other_op excluded
    expect(waRequestPayload.text).not.toContain("pending"); // pending excluded

    // Verify authorization header
    expect(waRequestHeaders?.Authorization).toBe(`Bearer ${env.WA_API_TOKEN}`);

    // Verify progress
    expect(updateProgressMock).toHaveBeenCalled();
    const progressCalls = updateProgressMock.mock.calls;
    expect(progressCalls[progressCalls.length - 1]![0]).toBe(100);
  });

  it("Case 2 (No Tickets): should early return and not call WA API when no matching tickets", async () => {
    const fakeEmptyMetrics = `
# HELP operator_ticket_created_timestamp_seconds Timestamp
operator_ticket_created_timestamp_seconds{category="OTHER",circuit_id="CR-999",operator="other_op",ticket_number="TK-999"} 1700000000
`;
    let waCalled = false;

    globalThis.fetch = mock(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr === env.PROM_TICKETS_URL) {
        return new Response(fakeEmptyMetrics, { status: 200 });
      }
      if (urlStr === env.WA_API_URL) {
        waCalled = true;
        return new Response("{}", { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const mockJob = {
      id: "fbstar-job-2",
      name: "send-fbstar-reminder",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    const result = await fbstarReminderProcessor(mockJob as any);

    expect(result.sent).toBe(false);
    expect(result.totalTickets).toBe(0);
    expect(waCalled).toBe(false);
  });

  it("Case 3 (Custom Recipient Override): should use data.to if provided in payload", async () => {
    const fakeMetrics = `
operator_ticket_created_timestamp_seconds{category="BGP",circuit_id="CR-1",operator="fbstar",ticket_number="TK-01"} 1700000000
`;
    let targetRecipient: string | null = null;

    globalThis.fetch = mock(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr === env.PROM_TICKETS_URL) {
        return new Response(fakeMetrics, { status: 200 });
      }
      if (urlStr === env.WA_API_URL) {
        const payload = JSON.parse(init?.body as string);
        targetRecipient = payload.to;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const mockJob = {
      id: "fbstar-job-3",
      name: "send-fbstar-reminder",
      data: { to: "628123456789@c.us" },
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    const result = await fbstarReminderProcessor(mockJob as any);

    expect(result.sent).toBe(true);
    expect(result.recipient).toBe("628123456789@c.us");
    expect(targetRecipient).toBe("628123456789@c.us");
  });

  it("Case 4 (Prometheus Failure): should throw error when Prometheus endpoint fails", async () => {
    globalThis.fetch = mock(async () => {
      return new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" });
    }) as any;

    const mockJob = {
      id: "fbstar-job-4",
      name: "send-fbstar-reminder",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    expect(fbstarReminderProcessor(mockJob as any)).rejects.toThrow("Gagal mengambil metrik");
  });

  it("Case 5 (WhatsApp Failure): should throw error when WhatsApp API returns non-200", async () => {
    const fakeMetrics = `
operator_ticket_created_timestamp_seconds{category="BGP",circuit_id="CR-1",operator="fbstar",ticket_number="TK-01"} 1700000000
`;
    globalThis.fetch = mock(async (url: any) => {
      const urlStr = String(url);
      if (urlStr === env.PROM_TICKETS_URL) {
        return new Response(fakeMetrics, { status: 200 });
      }
      return new Response("Unauthorized Token", { status: 401, statusText: "Unauthorized" });
    }) as any;

    const mockJob = {
      id: "fbstar-job-5",
      name: "send-fbstar-reminder",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    expect(fbstarReminderProcessor(mockJob as any)).rejects.toThrow("Gagal mengirim WhatsApp");
  });

  it("Case 6 (Worker Creation): should create BullMQ worker with correct queue name", async () => {
    const worker = createFbstarReminderWorker();
    expect(worker.name).toBe(FBSTAR_REMINDER_QUEUE_NAME);
    await worker.close();
  });
});
