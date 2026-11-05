/**
 * Script untuk mencari graph berdasarkan nama dan host di Zabbix.
 *
 * Jalankan: bun run scripts/zabbix-find-graph.ts
 */

const CONFIG = {
  url: process.env.ZABBIX_URL || "https://zabbix.nusa.net.id/api_jsonrpc.php",
  username: process.env.ZABBIX_USERNAME || "nismedan",
  password: process.env.ZABBIX_PASSWORD || "",
  targetHost: "gift-accel",
  targetGraphName: "Traffic abdurrahmangq3",
};

function resolveApiUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (url.endsWith("/index.php")) {
    url = url.replace(/\/index\.php$/, "/api_jsonrpc.php");
  } else if (!url.endsWith("/api_jsonrpc.php")) {
    url = url.replace(/\/+$/, "") + "/api_jsonrpc.php";
  }
  return url;
}

let rpcId = 1;

async function callZabbixRpc<T>(
  apiUrl: string,
  method: string,
  params: unknown,
  auth?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json-rpc",
  };

  if (auth) {
    headers["Authorization"] = `Bearer ${auth}`;
  }

  const payload: Record<string, unknown> = {
    jsonrpc: "2.0",
    method,
    params,
    id: rpcId++,
  };

  if (auth && method !== "user.login" && method !== "apiinfo.version") {
    payload.auth = auth;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP Error ${response.status} (${response.statusText}): ${text}`);
  }

  const resJson = (await response.json()) as any;

  if (resJson.error) {
    throw new Error(
      `Zabbix Error [${resJson.error.code}]: ${resJson.error.message} - ${resJson.error.data}`
    );
  }

  return resJson.result;
}

async function main() {
  const apiUrl = resolveApiUrl(CONFIG.url);

  console.log("==========================================");
  console.log("   Pencarian Graph & Host di Zabbix");
  console.log("==========================================");
  console.log(`Target Host       : ${CONFIG.targetHost}`);
  console.log(`Target Graph Name : ${CONFIG.targetGraphName}`);
  console.log("------------------------------------------");

  try {
    // 1. Login
    console.log("[*] Login ke Zabbix...");
    const authToken = await callZabbixRpc<string>(apiUrl, "user.login", {
      username: CONFIG.username,
      password: CONFIG.password,
    });
    console.log("✅ Berhasil login!");

    // 2. Cari Host 'gift-accel'
    console.log(`\n[*] Mencari host '${CONFIG.targetHost}'...`);
    const hosts = await callZabbixRpc<Array<{ hostid: string; host: string; name: string }>>(
      apiUrl,
      "host.get",
      {
        output: ["hostid", "host", "name"],
        filter: {
          host: [CONFIG.targetHost],
        },
      },
      authToken
    );

    let hostIds: string[] = [];
    if (hosts.length > 0) {
      console.log(`✅ Host ditemukan (${hosts.length} match):`);
      for (const h of hosts) {
        console.log(`   - ID: ${h.hostid} | Technical Name: ${h.host} | Visible Name: ${h.name}`);
        hostIds.push(h.hostid);
      }
    } else {
      console.log(`⚠️ Host dengan technical name persis '${CONFIG.targetHost}' tidak ditemukan.`);
      console.log(`[*] Mencoba pencarian loose / search host '${CONFIG.targetHost}'...`);
      const searchHosts = await callZabbixRpc<Array<{ hostid: string; host: string; name: string }>>(
        apiUrl,
        "host.get",
        {
          output: ["hostid", "host", "name"],
          search: {
            host: CONFIG.targetHost,
            name: CONFIG.targetHost,
          },
          searchByAny: true,
        },
        authToken
      );
      if (searchHosts.length > 0) {
        console.log(`✅ Host ditemukan melalui pencarian loose:`);
        for (const h of searchHosts) {
          console.log(`   - ID: ${h.hostid} | Technical Name: ${h.host} | Visible Name: ${h.name}`);
          hostIds.push(h.hostid);
        }
      } else {
        console.log(`⚠️ Tetap tidak ditemukan host dengan keyword '${CONFIG.targetHost}'.`);
      }
    }

    // 3. Cari Graph dengan nama 'Traffic abdurrahmangq3'
    console.log(`\n[*] Mencari graph '${CONFIG.targetGraphName}'...`);
    const graphQueryParams: any = {
      output: "extend",
      selectHosts: ["hostid", "host", "name"],
      selectItems: ["itemid", "name", "key_", "value_type"],
      selectGraphItems: "extend",
    };

    if (hostIds.length > 0) {
      graphQueryParams.hostids = hostIds;
    }

    // Coba filter exact match nama graph dulu
    let graphs = await callZabbixRpc<any[]>(
      apiUrl,
      "graph.get",
      {
        ...graphQueryParams,
        filter: {
          name: [CONFIG.targetGraphName],
        },
      },
      authToken
    );

    // Jika tidak ditemukan dengan exact filter, coba dengan search
    if (graphs.length === 0) {
      console.log(`[i] Pencarian exact tidak menemukan hasil, mencoba dengan parameter search...`);
      graphs = await callZabbixRpc<any[]>(
        apiUrl,
        "graph.get",
        {
          ...graphQueryParams,
          search: {
            name: CONFIG.targetGraphName,
          },
        },
        authToken
      );
    }

    // Jika masih belum ada dan tadi dibatasi hostIds, coba cari secara global tanpa filter hostids
    if (graphs.length === 0 && hostIds.length > 0) {
      console.log(`[i] Tidak ditemukan pada host spesifik, mencoba pencarian graph secara global di semua host...`);
      graphs = await callZabbixRpc<any[]>(
        apiUrl,
        "graph.get",
        {
          output: "extend",
          selectHosts: ["hostid", "host", "name"],
          selectItems: ["itemid", "name", "key_", "value_type"],
          search: {
            name: CONFIG.targetGraphName,
          },
        },
        authToken
      );
    }

    console.log("------------------------------------------");
    if (graphs.length === 0) {
      console.log(`❌ Tidak ditemukan graph dengan nama '${CONFIG.targetGraphName}'.`);
    } else {
      console.log(`🎉 Ditemukan ${graphs.length} graph:`);
      for (const g of graphs) {
        console.log(`\n==========================================`);
        console.log(`Graph ID     : ${g.graphid}`);
        console.log(`Graph Name   : ${g.name}`);
        console.log(`Width x Height: ${g.width} x ${g.height}`);
        console.log(`Graph Type   : ${g.graphtype}`);
        
        console.log(`\nHosts Terkait:`);
        if (g.hosts && g.hosts.length > 0) {
          for (const h of g.hosts) {
            console.log(`  - Host ID: ${h.hostid} | Name: ${h.host} (${h.name})`);
          }
        } else {
          console.log(`  (Tidak ada info host)`);
        }

        console.log(`\nItems Terkait (${g.items?.length || 0} items):`);
        if (g.items && g.items.length > 0) {
          for (const itm of g.items) {
            console.log(`  - Item ID: ${itm.itemid} | Name: ${itm.name} | Key: ${itm.key_}`);
          }
        }
      }
    }
    console.log("\n==========================================");
  } catch (error: any) {
    console.error("\n❌ Terjadi kesalahan:");
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
