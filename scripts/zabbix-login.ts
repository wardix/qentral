/**
 * Script mandiri untuk menguji autentikasi Zabbix menggunakan Bun.
 *
 * Cara menjalankan:
 *   bun run scripts/zabbix-login.ts
 */

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

// Konfigurasi target login
const CONFIG = {
  // Jika URL mengarah ke index.php atau root, script akan menyesuaikan ke endpoint API JSON-RPC
  url: process.env.ZABBIX_URL || "https://zabbix.nusa.net.id/api_jsonrpc.php",
  username: process.env.ZABBIX_USERNAME || "nismedan",
  password: process.env.ZABBIX_PASSWORD || "",
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

async function callZabbixRpc<T>(
  apiUrl: string,
  method: string,
  params: unknown,
  auth?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json-rpc",
  };

  // Zabbix 5.4+ mendukung header Bearer, dan beberapa versi menggunakan auth param
  if (auth) {
    headers["Authorization"] = `Bearer ${auth}`;
  }

  const payload: Record<string, unknown> = {
    jsonrpc: "2.0",
    method,
    params,
    id: 1,
  };

  // Untuk kompatibilitas versi Zabbix lama (Zabbix < 5.4 atau jika auth param dibutuhkan)
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

  const resJson = (await response.json()) as ZabbixRPCResponse<T>;

  if (resJson.error) {
    throw new Error(
      `Zabbix Error [${resJson.error.code}]: ${resJson.error.message} - ${resJson.error.data}`
    );
  }

  if (resJson.result === undefined) {
    throw new Error("Respon tidak memuat result (undefined)");
  }

  return resJson.result;
}

async function main() {
  const apiUrl = resolveApiUrl(CONFIG.url);

  console.log("==========================================");
  console.log("   Zabbix JSON-RPC Login Tester (Bun)");
  console.log("==========================================");
  console.log(`Target URL : ${apiUrl}`);
  console.log(`Username   : ${CONFIG.username}`);
  console.log("------------------------------------------");

  try {
    // 1. Cek versi Zabbix API (tanpa butuh login)
    try {
      const version = await callZabbixRpc<string>(apiUrl, "apiinfo.version", {});
      console.log(`[+] Terhubung ke Zabbix Server. Versi API: ${version}`);
    } catch (err: any) {
      console.warn(`[!] Gagal mengambil apiinfo.version (opsional): ${err.message}`);
    }

    // 2. Lakukan login (user.login)
    console.log("[*] Mengirim request login (user.login)...");
    const authToken = await callZabbixRpc<string>(apiUrl, "user.login", {
      username: CONFIG.username,
      password: CONFIG.password,
    });

    console.log("\n✅ Login Berhasil!");
    console.log(`🔑 Auth Token / Session ID: ${authToken}`);

    // 3. Verifikasi token dengan mengambil info user login
    try {
      console.log("\n[*] Memverifikasi sesi dengan query user saat ini...");
      const users = await callZabbixRpc<Array<{ userid: string; username?: string; alias?: string }>>(
        apiUrl,
        "user.get",
        {
          output: ["userid", "username", "name", "surname"],
        },
        authToken
      );

      console.log("✅ Token valid! Info Akun:");
      console.dir(users, { depth: null });
    } catch (verifErr: any) {
      console.warn(`[!] Token berhasil didapat tetapi query user.get gagal: ${verifErr.message}`);
    }

    console.log("\n==========================================");
    console.log("Pengujian selesai dengan sukses.");
  } catch (error: any) {
    console.error("\n❌ Login Gagal:");
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
