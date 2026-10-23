import { describe, it, expect, mock, afterEach } from "bun:test";
import {
  employeeSummaryProcessor,
  createEmployeeSummaryWorker,
  EMPLOYEE_SUMMARY_QUEUE_NAME,
} from "../../src/workers/employee-summary.worker";
import { env } from "../../src/config/env";

describe("Employee Ticket Summary Worker & Processor", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("Case 1 (Happy Path): should fetch employee summary from NIS, format message with gem icon for >= 7 tickets, dispatch to WA API, and return success", async () => {
    const fakeNisResponse = {
      results: [
        {
          employee_id: "0200101",
          name: "Budi Santoso",
          total_tickets: 8,
          tickets: [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008],
        },
        {
          employee_id: "0200102",
          name: "Siti Rahma",
          total_tickets: 4,
          tickets: [2001, 2002, 2003, 2004],
        },
      ],
    };

    let waRequestPayload: any = null;
    let nisRequestHeaders: any = null;
    let nisRequestUrl: string | null = null;

    globalThis.fetch = mock(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.startsWith(env.NIS_EMPLOYEE_SUMMARY_URL)) {
        nisRequestUrl = urlStr;
        nisRequestHeaders = init?.headers;
        return new Response(JSON.stringify(fakeNisResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr === env.WA_API_URL) {
        waRequestPayload = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ status: "success", message_id: "wa-msg-summary-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const updateProgressMock = mock(async (_progress: number) => {});
    const logMock = mock(async (_message: string) => {});

    const mockJob = {
      id: "summary-job-1",
      name: "send-employee-ticket-summary",
      data: {},
      updateProgress: updateProgressMock,
      log: logMock,
    };

    const result = await employeeSummaryProcessor(mockJob as any);

    // Verify NIS request
    expect(nisRequestUrl).not.toBeNull();
    const parsedUrl = new URL(nisRequestUrl!);
    expect(parsedUrl.searchParams.get("department_id")).toBe(env.DEFAULT_DEPARTMENT_ID.toString());
    expect(parsedUrl.searchParams.get("target_date")).toBeDefined();
    expect(nisRequestHeaders?.Authorization).toBe(`Bearer ${env.NIS_TOKEN}`);

    // Verify WA request
    expect(waRequestPayload).not.toBeNull();
    expect(waRequestPayload.to).toBe(env.WA_TICKET_SUMMARY_TARGET_NUMBER);
    expect(waRequestPayload.text).toContain("📊 Summary Tiket Karyawan");
    expect(waRequestPayload.text).toContain("Total: 12 tiket, 2 karyawan");
    expect(waRequestPayload.text).toContain("1. 💎Budi Santoso (8 tiket)");
    expect(waRequestPayload.text).toContain("2. Siti Rahma (4 tiket)");

    // Verify result
    expect(result.sent).toBe(true);
    expect(result.totalTickets).toBe(12);
    expect(result.totalEmployees).toBe(2);
    expect(updateProgressMock).toHaveBeenCalled();
  });

  it("Case 2 (Custom Recipient & Options): should respect custom recipient, target_date, department_id, and excluded_employee_ids", async () => {
    let nisRequestUrl: string | null = null;
    let waRequestPayload: any = null;

    globalThis.fetch = mock(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.startsWith(env.NIS_EMPLOYEE_SUMMARY_URL)) {
        nisRequestUrl = urlStr;
        return new Response(
          JSON.stringify({
            results: [
              {
                employee_id: "0200999",
                name: "Eko Pratama",
                total_tickets: 2,
                tickets: [3001, 3002],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr === env.WA_API_URL) {
        waRequestPayload = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ status: "success" }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const mockJob = {
      id: "summary-job-2",
      name: "send-employee-ticket-summary",
      data: {
        to: "62899999999@g.us",
        targetDate: "2026-10-20",
        departmentId: 10,
        excludedEmployeeIds: "0200111,0200222",
      },
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    const result = await employeeSummaryProcessor(mockJob as any);

    const parsedUrl = new URL(nisRequestUrl!);
    expect(parsedUrl.searchParams.get("target_date")).toBe("2026-10-20");
    expect(parsedUrl.searchParams.get("department_id")).toBe("10");
    expect(parsedUrl.searchParams.get("excluded_employee_ids")).toBe("0200111,0200222");

    expect(waRequestPayload.to).toBe("62899999999@g.us");
    expect(result.sent).toBe(true);
    expect(result.targetDate).toBe("2026-10-20");
    expect(result.totalTickets).toBe(2);
    expect(result.totalEmployees).toBe(1);
  });

  it("Case 3 (Empty Tickets): should not send WhatsApp message if employees list is empty", async () => {
    let waCalled = false;

    globalThis.fetch = mock(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.startsWith(env.NIS_EMPLOYEE_SUMMARY_URL)) {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr === env.WA_API_URL) {
        waCalled = true;
        return new Response(JSON.stringify({ status: "success" }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const mockJob = {
      id: "summary-job-3",
      name: "send-employee-ticket-summary",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    const result = await employeeSummaryProcessor(mockJob as any);

    expect(waCalled).toBe(false);
    expect(result.sent).toBe(false);
    expect(result.totalTickets).toBe(0);
    expect(result.totalEmployees).toBe(0);
    expect(result.message).toContain("Tidak ada data summary tiket karyawan");
  });

  it("Case 4 (NIS Failure): should throw error when NIS Gateway API fails", async () => {
    globalThis.fetch = mock(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.startsWith(env.NIS_EMPLOYEE_SUMMARY_URL)) {
        return new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const mockJob = {
      id: "summary-job-4",
      name: "send-employee-ticket-summary",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    await expect(employeeSummaryProcessor(mockJob as any)).rejects.toThrow(
      "Gagal mengambil summary tiket"
    );
  });

  it("Case 5 (WhatsApp API Failure): should throw error when WhatsApp API returns non-ok status", async () => {
    globalThis.fetch = mock(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.startsWith(env.NIS_EMPLOYEE_SUMMARY_URL)) {
        return new Response(
          JSON.stringify({
            results: [
              {
                employee_id: "0200101",
                name: "Budi",
                total_tickets: 1,
                tickets: [9999],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr === env.WA_API_URL) {
        return new Response("Unauthorized Token", {
          status: 401,
          statusText: "Unauthorized",
        });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const mockJob = {
      id: "summary-job-5",
      name: "send-employee-ticket-summary",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    await expect(employeeSummaryProcessor(mockJob as any)).rejects.toThrow(
      "Gagal mengirim WhatsApp"
    );
  });

  it("Case 6 (Worker Lifecycle): should create a BullMQ Worker listening to employee-summary-queue", () => {
    const worker = createEmployeeSummaryWorker();
    expect(worker).toBeDefined();
    expect(worker.name).toBe(EMPLOYEE_SUMMARY_QUEUE_NAME);
    worker.close();
  });
});
