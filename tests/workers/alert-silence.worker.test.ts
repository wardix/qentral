import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  alertSilenceProcessor,
  createAlertSilenceWorker,
  ALERT_SILENCE_QUEUE_NAME,
  parseSilenceAttributes,
  convertDurationToSeconds,
} from "../../src/workers/alert-silence.worker";
import { env } from "../../src/config/env";

describe("Alert Silence Worker & Processor", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset state before each test
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Utility Functions", () => {
    it("convertDurationToSeconds should parse units properly", () => {
      expect(convertDurationToSeconds("30s")).toBe(30);
      expect(convertDurationToSeconds("15m")).toBe(900);
      expect(convertDurationToSeconds("2h")).toBe(7200);
      expect(convertDurationToSeconds("1d")).toBe(86400);
      expect(convertDurationToSeconds("1w")).toBe(604800);
      expect(() => convertDurationToSeconds("10x")).toThrow("Invalid time format");
    });

    it("parseSilenceAttributes should parse key-value pairs and quotes", () => {
      const parsed = parseSilenceAttributes(
        'instance=node1 alertname=DiskFull comment="Disk maintenance" duration=2h'
      );
      expect(parsed).toEqual({
        instance: "node1",
        alertname: "DiskFull",
        comment: "Disk maintenance",
        duration: "2h",
      });
    });

    it("parseSilenceAttributes should throw on invalid syntax", () => {
      expect(() => parseSilenceAttributes("=invalid")).toThrow();
      expect(() => parseSilenceAttributes("invalid key=val")).toThrow();
    });
  });

  describe("Processor Execution", () => {
    it("Case 1 (Happy Path - String Attributes): should parse attributes, post to Alertmanager, send WA notification, and return success", async () => {
      let alertmanagerPayload: any = null;
      let waPayload: any = null;

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr === env.SILENCE_ALERT_API_URL) {
          alertmanagerPayload = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ silenceID: "silence-uuid-12345" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr === env.WA_API_URL) {
          waPayload = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ status: "success", message_id: "wa-1" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const updateProgressMock = mock(async (_progress: number) => {});
      const logMock = mock(async (_message: string) => {});

      const mockJob = {
        id: "alert-silence-1",
        name: "silence-alert",
        data: {
          attributes: 'instance=router1 alertname=HighBgpFlap duration=1h comment="Maintenance BGP"',
          contact: "noc@nusanet.id",
          notify: "08123456789@c.us",
        },
        updateProgress: updateProgressMock,
        log: logMock,
      };

      const result = await alertSilenceProcessor(mockJob as any);

      expect(result.success).toBe(true);
      expect(result.silenceId).toBe("silence-uuid-12345");
      expect(result.comment).toBe("Maintenance BGP");
      expect(result.createdBy).toBe("noc@nusanet.id");
      expect(result.notified).toBe(true);

      // Verify Alertmanager payload
      expect(alertmanagerPayload).toBeDefined();
      expect(alertmanagerPayload.createdBy).toBe("noc@nusanet.id");
      expect(alertmanagerPayload.comment).toBe("Maintenance BGP");
      expect(alertmanagerPayload.matchers).toEqual([
        { name: "instance", value: "router1", isRegex: false },
        { name: "alertname", value: "HighBgpFlap", isRegex: false },
      ]);
      expect(new Date(alertmanagerPayload.endsAt).getTime()).toBeGreaterThan(
        new Date(alertmanagerPayload.startsAt).getTime()
      );

      // Verify WA notification
      expect(waPayload).toBeDefined();
      expect(waPayload.to).toBe("08123456789");
      expect(waPayload.text).toBe("silenced");
    });

    it("Case 2 (Happy Path - Structured Data with ISO end): should handle structured input with end date", async () => {
      let alertmanagerPayload: any = null;

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr === env.SILENCE_ALERT_API_URL) {
          alertmanagerPayload = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ silenceID: "silence-structured-999" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "alert-silence-2",
        name: "create-silence",
        data: {
          matchers: [
            { name: "service", value: "payment-gateway", isRegex: true },
          ],
          end: "2026-10-25T12:00:00.000Z",
          comment: "Upgrading payment gateway",
          contact: "devops@nusanet.id",
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      const result = await alertSilenceProcessor(mockJob as any);

      expect(result.success).toBe(true);
      expect(result.silenceId).toBe("silence-structured-999");
      expect(alertmanagerPayload.matchers).toEqual([
        { name: "service", value: "payment-gateway", isRegex: true },
      ]);
      expect(alertmanagerPayload.endsAt).toBe("2026-10-25T12:00:00.000Z");
      expect(result.notified).toBe(false);
    });

    it("Case 3 (Unhappy Path - Missing comment): should notify WA with error and throw", async () => {
      let waPayload: any = null;

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr === env.WA_API_URL) {
          waPayload = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ status: "success" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "alert-silence-3",
        name: "silence-alert",
        data: {
          attributes: "instance=server1 duration=1h",
          contact: "noc@nusanet.id",
          notify: "08123456789",
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      await expect(alertSilenceProcessor(mockJob as any)).rejects.toThrow("`comment' attribute is required");
      expect(waPayload).toBeDefined();
      expect(waPayload.to).toBe("08123456789");
      expect(waPayload.text).toContain("`comment' attribute is required");
    });

    it("Case 4 (Unhappy Path - Conflict duration and end): should notify WA and throw", async () => {
      let waPayload: any = null;

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr === env.WA_API_URL) {
          waPayload = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ status: "success" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "alert-silence-4",
        name: "silence-alert",
        data: {
          attributes: 'instance=server1 duration=1h end=2026-10-25T12:00:00Z comment="test"',
          contact: "noc@nusanet.id",
          notify: "08123456789",
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      await expect(alertSilenceProcessor(mockJob as any)).rejects.toThrow("conflict attributes: `duration' and `end'");
      expect(waPayload).toBeDefined();
      expect(waPayload.text).toContain("conflict attributes");
    });

    it("Case 5 (Unhappy Path - Missing duration and end): should notify WA and throw", async () => {
      let waPayload: any = null;

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr === env.WA_API_URL) {
          waPayload = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ status: "success" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "alert-silence-5",
        name: "silence-alert",
        data: {
          attributes: 'instance=server1 comment="test"',
          contact: "noc@nusanet.id",
          notify: "08123456789",
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      await expect(alertSilenceProcessor(mockJob as any)).rejects.toThrow("`duration' or `end' attribute is required");
      expect(waPayload).toBeDefined();
      expect(waPayload.text).toContain("`duration' or `end' attribute is required");
    });

    it("Case 6 (Unhappy Path - Alertmanager API error): should notify WA and throw", async () => {
      let waPayload: any = null;

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr === env.SILENCE_ALERT_API_URL) {
          return new Response("Bad gateway", { status: 502, statusText: "Bad Gateway" });
        }
        if (urlStr === env.WA_API_URL) {
          waPayload = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ status: "success" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "alert-silence-6",
        name: "silence-alert",
        data: {
          attributes: 'instance=server1 duration=1h comment="maintenance"',
          contact: "noc@nusanet.id",
          notify: "08123456789",
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      await expect(alertSilenceProcessor(mockJob as any)).rejects.toThrow("Gagal submit silence ke Alertmanager: Bad Gateway");
      expect(waPayload).toBeDefined();
      expect(waPayload.text).toContain("Gagal submit silence ke Alertmanager");
    });
  });

  describe("Worker Creation", () => {
    it("createAlertSilenceWorker should create Worker with correct queue name", () => {
      const worker = createAlertSilenceWorker();
      expect(worker).toBeDefined();
      expect(worker.name).toBe(ALERT_SILENCE_QUEUE_NAME);
      expect(ALERT_SILENCE_QUEUE_NAME).toBe("alert-silence-queue");
    });
  });
});
