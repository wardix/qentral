import { describe, it, expect, mock, afterEach } from "bun:test";
import {
  iforteGraphsSyncProcessor,
  createIforteGraphsSyncWorker,
  IFORTE_GRAPHS_SYNC_QUEUE_NAME,
} from "../../src/workers/iforte-graphs-sync.worker";
import { env } from "../../src/config/env";

describe("iForte Graphs Sync Worker & Processor", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("Case 1 (Happy Path): should login to Zabbix, fetch graphs, extract subscriberId, sync in batches to NIS endpoint, and return success", async () => {
    let zabbixLoginCalled = false;
    let syncPayload: any = null;
    let syncHeaders: any = null;

    globalThis.fetch = mock(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr === env.IFORTE_ZABBIX_URL) {
        const body = JSON.parse(init?.body as string);
        if (body.method === "user.login") {
          zabbixLoginCalled = true;
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: "zabbix-test-token-123",
              id: body.id,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (body.method === "graph.get" && body.params.output?.length === 1) {
          // get graph IDs
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: [{ graphid: "101" }, { graphid: "102" }],
              id: body.id,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (body.method === "graph.get" && body.params.selectItems) {
          // get graph details
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: [
                {
                  graphid: "101",
                  name: "NUSANET-1001",
                  items: [{ name: "Interface Gigabit (99:8888)" }],
                },
                {
                  graphid: "102",
                  name: "NUSANET-1002",
                  items: [{ name: "No match pattern here" }],
                },
              ],
              id: body.id,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      if (urlStr === env.NIS_GRAPH_SYNC_URL) {
        syncHeaders = init?.headers;
        syncPayload = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ status: "success" }), { status: 200 });
      }

      return new Response("Not found", { status: 404 });
    }) as any;

    const updateProgressMock = mock(async (_progress: number) => {});
    const logMock = mock(async (_message: string) => {});

    const mockJob = {
      id: "sync-job-1",
      name: "sync-iforte-graphs",
      data: {},
      updateProgress: updateProgressMock,
      log: logMock,
    };

    const result = await iforteGraphsSyncProcessor(mockJob as any);

    expect(zabbixLoginCalled).toBe(true);
    expect(syncHeaders?.Authorization).toBe(`Bearer ${env.NIS_TOKEN}`);
    expect(syncPayload).not.toBeNull();
    expect(syncPayload.data).toEqual([
      {
        subscriber_id: "8888",
        graph_id: `${env.IFORTE_GRAPH_ID_PREFIX}101`,
      },
    ]);

    expect(result.success).toBe(true);
    expect(result.totalGraphsFound).toBe(2);
    expect(result.syncedCount).toBe(1);
    expect(updateProgressMock).toHaveBeenCalled();
  });

  it("Case 2 (No Graphs Found): should skip synchronization if no graphs match filter", async () => {
    let syncCalled = false;

    globalThis.fetch = mock(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr === env.IFORTE_ZABBIX_URL) {
        const body = JSON.parse(init?.body as string);
        if (body.method === "user.login") {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", result: "zabbix-token", id: body.id }),
            { status: 200 }
          );
        }
        if (body.method === "graph.get") {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", result: [], id: body.id }),
            { status: 200 }
          );
        }
      }
      if (urlStr === env.NIS_GRAPH_SYNC_URL) {
        syncCalled = true;
        return new Response(JSON.stringify({ status: "success" }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const mockJob = {
      id: "sync-job-2",
      name: "sync-iforte-graphs",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    const result = await iforteGraphsSyncProcessor(mockJob as any);

    expect(syncCalled).toBe(false);
    expect(result.success).toBe(true);
    expect(result.totalGraphsFound).toBe(0);
    expect(result.syncedCount).toBe(0);
  });

  it("Case 3 (Zabbix API Error): should throw when Zabbix returns RPC error", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32602,
            message: "Invalid params",
            data: "User credentials incorrect",
          },
          id: 1,
        }),
        { status: 200 }
      );
    }) as any;

    const mockJob = {
      id: "sync-job-3",
      name: "sync-iforte-graphs",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    await expect(iforteGraphsSyncProcessor(mockJob as any)).rejects.toThrow("Zabbix API Error");
  });

  it("Case 4 (NIS Sync Endpoint Error): should throw when NIS sync endpoint fails", async () => {
    globalThis.fetch = mock(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr === env.IFORTE_ZABBIX_URL) {
        const body = JSON.parse(init?.body as string);
        if (body.method === "user.login") {
          return new Response(JSON.stringify({ jsonrpc: "2.0", result: "token", id: body.id }), { status: 200 });
        }
        if (body.method === "graph.get" && body.params.output?.length === 1) {
          return new Response(JSON.stringify({ jsonrpc: "2.0", result: [{ graphid: "1" }], id: body.id }), { status: 200 });
        }
        if (body.method === "graph.get") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: [{ graphid: "1", name: "test", items: [{ name: "item (1:2)" }] }],
              id: body.id,
            }),
            { status: 200 }
          );
        }
      }
      if (urlStr === env.NIS_GRAPH_SYNC_URL) {
        return new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const mockJob = {
      id: "sync-job-4",
      name: "sync-iforte-graphs",
      data: {},
      updateProgress: mock(async () => {}),
      log: mock(async () => {}),
    };

    await expect(iforteGraphsSyncProcessor(mockJob as any)).rejects.toThrow("Sync endpoint error");
  });

  it("Case 5 (Worker Lifecycle): should create a BullMQ Worker listening to iforte-graphs-sync-queue", () => {
    const worker = createIforteGraphsSyncWorker();
    expect(worker).toBeDefined();
    expect(worker.name).toBe(IFORTE_GRAPHS_SYNC_QUEUE_NAME);
    worker.close();
  });
});
