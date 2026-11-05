import { describe, it, expect, mock, afterEach } from "bun:test";
import {
  nusacontactContactSyncProcessor,
  createNusacontactContactSyncWorker,
  transformCallerIdToNusacontact,
  NUSACONTACT_CONTACT_SYNC_QUEUE_NAME,
} from "../../src/workers/nusacontact-contact-sync.worker";
import { env } from "../../src/config/env";

describe("Nusacontact Contact Sync Worker & Processor", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockCallerIdResponse = {
    contact: {
      name: "Wardi",
      salutation: "Mas",
      phone: "628196066607",
    },
    customers: [
      {
        customer_id: "0200040634",
        company: "PT MEDIA ANTAR NUSA",
        branch: "020",
        subscribers: [
          {
            subscriber_id: "14414",
            service: "Dedicated Wireless Business Priority 4 Mbps",
            account: "wardix1",
            address: "Jl. Sei Batanghari gg. Singer no. 96e",
          },
          {
            subscriber_id: "29287",
            service: "Domain Indonesia .ID",
            account: "nusa.net.id",
            address: "",
          },
        ],
      },
      {
        customer_id: "0200284754",
        company: "Pt. Media Antar Nusa",
        branch: "025",
        subscribers: [],
      },
    ],
  };

  describe("Payload Transformation Helper", () => {
    it("should transform NIS caller-id data into valid Nusacontact payload with markdown links and WIB timezone", () => {
      const payload = transformCallerIdToNusacontact(mockCallerIdResponse);

      expect(payload.phone_number).toBe("628196066607");
      expect(payload.name).toBe("Wardi");
      expect(payload.timezone).toBe("Asia/Jakarta");
      expect(payload.branch_code).toBe("020, 025");

      const attributes = JSON.parse(payload.attributes);
      expect(attributes.salutation).toBe("Mas");
      expect(attributes.ids).toContain("[0200040634](https://isx.nusa.net.id/customer.php?custId=0200040634&pid=profile&module=customer)");
      expect(attributes.companies).toContain("[PT MEDIA ANTAR NUSA](https://isx.nusa.net.id/customer.php?custId=0200040634&pid=profile&module=customer)");
      expect(attributes.services).toContain("[Dedicated Wireless Business Priority 4 Mbps](https://isx.nusa.net.id/v2/customer/service/14414/detail)");
      expect(attributes.accounts).toContain("[wardix1](https://isx.nusa.net.id/v2/customer/service/14414/detail)");
      expect(attributes.addresses).toContain("[Jl. Sei Batanghari gg. Singer no. 96e](https://isx.nusa.net.id/v2/customer/service/14414/detail)");
    });

    it("should set timezone to Asia/Makassar when branch includes 062", () => {
      const makassarData = {
        contact: { name: "Andi", salutation: "Pak", phone: "6281234567890" },
        customers: [
          {
            customer_id: "0620001",
            company: "PT Celebes",
            branch: "062",
            subscribers: [],
          },
        ],
      };

      const payload = transformCallerIdToNusacontact(makassarData);
      expect(payload.timezone).toBe("Asia/Makassar");
      expect(payload.branch_code).toBe("062");
    });
  });

  describe("Processor Execution", () => {
    it("Case 1 (Happy Path): should fetch caller-id from NIS gateway, transform, post to Nusacontact, and return success", async () => {
      let nisGatewayCalled = false;
      let nusacontactCalled = false;
      let postedBody: any = null;
      let postedHeaders: any = null;

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);

        if (urlStr.includes("nis-gateway/customer/caller-id")) {
          nisGatewayCalled = true;
          expect(urlStr).toContain("phone=628196066607");
          expect(init?.headers?.Authorization).toBe(`Bearer ${env.NIS_TOKEN}`);
          return new Response(JSON.stringify(mockCallerIdResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (urlStr.includes("api/contacts")) {
          nusacontactCalled = true;
          postedHeaders = init?.headers;
          postedBody = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ status: "success" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response("Not found", { status: 404 });
      }) as any;

      const updateProgressMock = mock(async (_progress: number) => {});
      const logMock = mock(async (_message: string) => {});

      const mockJob = {
        id: "sync-job-1",
        name: "sync-nusacontact-contact",
        data: { phone: "628196066607" },
        updateProgress: updateProgressMock,
        log: logMock,
      };

      const result = await nusacontactContactSyncProcessor(mockJob as any);

      expect(nisGatewayCalled).toBe(true);
      expect(nusacontactCalled).toBe(true);
      expect(postedHeaders?.["X-Api-Key"]).toBe(env.NUSACONTACT_API_KEY);
      expect(postedBody.phone_number).toBe("628196066607");
      expect(postedBody.name).toBe("Wardi");

      expect(result.success).toBe(true);
      expect(result.synced).toBe(true);
      expect(result.phone).toBe("628196066607");
      expect(result.name).toBe("Wardi");
      expect(updateProgressMock).toHaveBeenCalled();
    });

    it("Case 2 (Invalid Phone Number): should reject phone numbers with less than 10 digits", async () => {
      const updateProgressMock = mock(async (_progress: number) => {});
      const logMock = mock(async (_message: string) => {});

      const mockJob = {
        id: "sync-job-2",
        name: "sync-nusacontact-contact",
        data: { phone: "12345" },
        updateProgress: updateProgressMock,
        log: logMock,
      };

      const result = await nusacontactContactSyncProcessor(mockJob as any);

      expect(result.success).toBe(false);
      expect(result.synced).toBe(false);
      expect(result.message).toContain("Nomor telepon tidak valid");
    });

    it("Case 3 (Customer Not Found in NIS Gateway): should finish gracefully without calling Nusacontact API", async () => {
      let nusacontactCalled = false;

      globalThis.fetch = mock(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes("nis-gateway/customer/caller-id")) {
          return new Response(JSON.stringify({ error: "Contact not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr.includes("api/contacts")) {
          nusacontactCalled = true;
          return new Response(JSON.stringify({ status: "success" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "sync-job-3",
        name: "sync-nusacontact-contact",
        data: { phone: "628999999999" },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      const result = await nusacontactContactSyncProcessor(mockJob as any);

      expect(nusacontactCalled).toBe(false);
      expect(result.success).toBe(true);
      expect(result.synced).toBe(false);
      expect(result.message).toContain("tidak ditemukan");
    });

    it("Case 4 (NIS Gateway Server Error): should throw error for retry", async () => {
      globalThis.fetch = mock(async () => {
        return new Response("Internal Server Error", { status: 500 });
      }) as any;

      const mockJob = {
        id: "sync-job-4",
        name: "sync-nusacontact-contact",
        data: { phone: "628196066607" },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      expect(nusacontactContactSyncProcessor(mockJob as any)).rejects.toThrow(
        "Gagal mengambil data caller-id NIS"
      );
    });

    it("Case 5 (Nusacontact API Server Error): should throw error for retry", async () => {
      globalThis.fetch = mock(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes("nis-gateway/customer/caller-id")) {
          return new Response(JSON.stringify(mockCallerIdResponse), { status: 200 });
        }
        return new Response("Service Unavailable", { status: 503 });
      }) as any;

      const mockJob = {
        id: "sync-job-5",
        name: "sync-nusacontact-contact",
        data: { phone: "628196066607" },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      expect(nusacontactContactSyncProcessor(mockJob as any)).rejects.toThrow(
        "Gagal sinkronisasi kontak ke Nusacontact"
      );
    });

    it("should export createNusacontactContactSyncWorker with correct queue name", () => {
      const worker = createNusacontactContactSyncWorker();
      expect(worker).toBeDefined();
      expect(worker.name).toBe(NUSACONTACT_CONTACT_SYNC_QUEUE_NAME);
    });
  });
});
