import { Worker, type Job, type WorkerOptions } from "bullmq";
import { getRedisConnection } from "../config/redis";
import { env } from "../config/env";
import { IFORTE_GRAPHS_SYNC_QUEUE_NAME } from "../queues/iforte-graphs-sync.queue";
import type { IforteGraphsSyncJobData, IforteGraphsSyncJobResult } from "../shared/types";

export { IFORTE_GRAPHS_SYNC_QUEUE_NAME };

interface SyncGraphData {
  graphid: string;
  subscriberId: string;
}

interface ZabbixGraphItem {
  name: string;
}

interface ZabbixGraph {
  graphid: string;
  name: string;
  items?: ZabbixGraphItem[];
}

interface ZabbixRPCResponse<T> {
  jsonrpc: "2.0";
  result?: T;
  error?: {
    code: number;
    message: string;
    data: string;
  };
  id: number;
}

let rpcCounter = 1;

async function zabbixRequest<T>(
  method: string,
  params: unknown,
  sessionId?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json-rpc",
  };
  if (sessionId) {
    headers.Authorization = `Bearer ${sessionId}`;
  }

  const response = await fetch(env.IFORTE_ZABBIX_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: rpcCounter++,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Zabbix HTTP error: ${response.status} ${response.statusText}. Body: ${body}`);
  }

  const data = (await response.json()) as ZabbixRPCResponse<T>;

  if (data.error) {
    throw new Error(
      `Zabbix API Error [${data.error.code}]: ${data.error.message}. ${data.error.data}`
    );
  }

  if (data.result === undefined) {
    throw new Error("Zabbix API Error: Result is undefined");
  }

  return data.result;
}

async function zabbixLogin(): Promise<string> {
  return zabbixRequest<string>("user.login", {
    username: env.IFORTE_ZABBIX_USERNAME,
    password: env.IFORTE_ZABBIX_PASSWORD,
  });
}

async function zabbixGetGraphIds(sessionId: string, filter: string): Promise<string[]> {
  const graphs = await zabbixRequest<{ graphid: string }[]>(
    "graph.get",
    {
      output: ["graphid"],
      search: { name: filter },
      startSearch: true,
      sortfield: "graphid",
      sortOrder: "ASC",
    },
    sessionId
  );
  return (graphs || []).map((g) => g.graphid);
}

async function zabbixGetGraphsDetails(
  sessionId: string,
  graphids: string[]
): Promise<ZabbixGraph[]> {
  return zabbixRequest<ZabbixGraph[]>(
    "graph.get",
    {
      output: ["graphid", "name"],
      graphids,
      selectItems: ["name"],
      sortfield: "graphid",
      sortOrder: "ASC",
    },
    sessionId
  );
}

async function syncToEndpoint(batch: SyncGraphData[], prefix: string): Promise<void> {
  const response = await fetch(env.NIS_GRAPH_SYNC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.NIS_TOKEN}`,
    },
    body: JSON.stringify({
      data: batch.map((item) => ({
        subscriber_id: item.subscriberId,
        graph_id: `${prefix}${item.graphid}`,
      })),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sync endpoint error: ${response.status} ${response.statusText}. ${body}`);
  }
}

export async function iforteGraphsSyncProcessor(
  job: Job<IforteGraphsSyncJobData, IforteGraphsSyncJobResult>
): Promise<IforteGraphsSyncJobResult> {
  const graphFilter =
    job.data.graphNameFilter ?? job.data.graph_name_filter ?? env.IFORTE_ZABBIX_GRAPH_NAME_FILTER;
  const graphPrefix =
    job.data.graphIdPrefix ?? job.data.graph_id_prefix ?? env.IFORTE_GRAPH_ID_PREFIX;

  await job.updateProgress(5);
  await job.log("Starting iForte Zabbix graph synchronization...");

  const token = await zabbixLogin();
  await job.log("Logged in to Zabbix successfully.");
  await job.updateProgress(15);

  const graphIds = await zabbixGetGraphIds(token, graphFilter);
  await job.log(`Found ${graphIds.length} graph(s) matching filter '${graphFilter}' in Zabbix.`);
  await job.updateProgress(25);

  if (graphIds.length === 0) {
    await job.log("No graphs found. Skipping.");
    await job.updateProgress(100);
    return {
      success: true,
      totalGraphsFound: 0,
      syncedCount: 0,
      message: "No graphs found. Skipping.",
      syncedAt: new Date().toISOString(),
    };
  }

  const CHUNK_SIZE = 1000;
  let totalValidItems = 0;

  for (let i = 0; i < graphIds.length; i += CHUNK_SIZE) {
    const chunk = graphIds.slice(i, i + CHUNK_SIZE);
    const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(graphIds.length / CHUNK_SIZE);

    await job.log(`Fetching details for chunk ${chunkNumber}/${totalChunks}...`);
    const fullGraphs = await zabbixGetGraphsDetails(token, chunk);

    const syncData: SyncGraphData[] = fullGraphs
      .map((graph) => {
        const firstItemName = graph.items?.[0]?.name ?? "";
        const match = firstItemName.match(/(\d+):(\d+)/);
        if (!match) return null;

        return {
          graphid: graph.graphid,
          subscriberId: match[2],
        };
      })
      .filter((item): item is SyncGraphData => item !== null);

    totalValidItems += syncData.length;

    if (syncData.length > 0) {
      const BATCH_SIZE = 64;
      for (let j = 0; j < syncData.length; j += BATCH_SIZE) {
        const batch = syncData.slice(j, j + BATCH_SIZE);
        await syncToEndpoint(batch, graphPrefix);
      }
    }

    const progress = Math.min(95, Math.floor(25 + ((i + chunk.length) / graphIds.length) * 70));
    await job.updateProgress(progress);
  }

  await job.log(`Successfully synchronized ${totalValidItems} valid items in total.`);
  await job.updateProgress(100);

  return {
    success: true,
    totalGraphsFound: graphIds.length,
    syncedCount: totalValidItems,
    syncedAt: new Date().toISOString(),
  };
}

export function createIforteGraphsSyncWorker(
  options?: Partial<WorkerOptions>
): Worker<IforteGraphsSyncJobData, IforteGraphsSyncJobResult> {
  return new Worker<IforteGraphsSyncJobData, IforteGraphsSyncJobResult>(
    IFORTE_GRAPHS_SYNC_QUEUE_NAME,
    iforteGraphsSyncProcessor,
    {
      connection: getRedisConnection(),
      concurrency: env.DEFAULT_WORKER_CONCURRENCY,
      ...options,
    }
  );
}
