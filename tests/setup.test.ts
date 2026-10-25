import { describe, it, expect } from "bun:test";
import { env, loadEnv } from "../src/config/env";

describe("Setup & Environment Config", () => {
  it("should have Bun test runner functioning properly", () => {
    const sum = (a: number, b: number) => a + b;
    expect(sum(1, 2)).toBe(3);
  });

  it("should provide default configuration matching .env.example", () => {
    const config = loadEnv({});
    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(3000);
    expect(config.REDIS_HOST).toBe("127.0.0.1");
    expect(config.REDIS_PORT).toBe(6379);
    expect(config.REDIS_PASSWORD).toBe("");
    expect(config.REDIS_DB).toBe(0);
    expect(config.API_KEY).toBe("ganti-dengan-kunci-rahasia-anda");
    expect(config.DASHBOARD_USERNAME).toBe("admin");
    expect(config.DASHBOARD_PASSWORD).toBe("adminpassword");
    expect(config.DEFAULT_WORKER_CONCURRENCY).toBe(5);
    expect(config.JOB_RETENTION_COMPLETED_COUNT).toBe(1000);
    expect(config.JOB_RETENTION_FAILED_COUNT).toBe(5000);
    expect(config.PROM_TICKETS_URL).toBe("https://metrics.example.com/operator-tickets");
    expect(config.WA_API_URL).toBe("https://api.whatsapp.example.com/v2/messages");
    expect(config.WA_API_TOKEN).toBe("");
    expect(config.WA_FBSTAR_TARGET_NUMBER).toBe("");
    expect(config.NIS_IFORTE_TICKETS_URL).toBe("https://api.example.com/tickets/iforte");
    expect(config.NIS_TOKEN).toBe("");
    expect(config.WA_IFORTE_TARGET_NUMBER).toBe("");
    expect(config.NIS_EMPLOYEE_SUMMARY_URL).toBe("https://api.example.com/tickets/employee-summary");
    expect(config.WA_TICKET_SUMMARY_TARGET_NUMBER).toBe("");
    expect(config.DEFAULT_DEPARTMENT_ID).toBe(34);
    expect(config.DEFAULT_EXCLUDED_EMPLOYEE_IDS).toBe("");
    expect(config.IFORTE_ZABBIX_URL).toBe("https://zabbix.example.com/api_jsonrpc.php");
    expect(config.IFORTE_ZABBIX_USERNAME).toBe("");
    expect(config.IFORTE_ZABBIX_PASSWORD).toBe("");
    expect(config.IFORTE_ZABBIX_GRAPH_NAME_FILTER).toBe("NUSANET-");
    expect(config.IFORTE_GRAPH_ID_PREFIX).toBe("iforte-");
    expect(config.NIS_GRAPH_SYNC_URL).toBe("https://api.example.com/v1/sync/graphs");
    expect(config.SILENCE_ALERT_API_URL).toBe("https://alertmanager.example.com/api/v2/silences");
    expect(config.NUSAWORK_TOKEN_API_URL).toBe("https://nusawork.example.com/auth/api/oauth/token");
    expect(config.NUSAWORK_CLIENT_ID).toBe("");
    expect(config.NUSAWORK_CLIENT_SECRET).toBe("");
    expect(config.NUSAWORK_EMPLOYEE_API_URL).toBe("https://nusawork.example.com/api/v4.1/employee/filter");
    expect(config.BIRTHDAY_PIC_PHONES).toBe("[]");
    expect(config.BIRTHDAY_GIFT_VOUCHER_TEMPLATE_PATH).toBe("./assets/birthday-voucher-template.png");
    expect(config.BIRTHDAY_GIFT_VOUCHER_PERIOD_DAYS).toBe(30);
    expect(config.BIRTHDAY_WISHES).toBe("Happy birthday");
  });

  it("should read custom environment variables and parse numbers correctly", () => {
    const custom = loadEnv({
      NODE_ENV: "production",
      PORT: "8080",
      REDIS_HOST: "redis.internal",
      REDIS_PORT: "6380",
      REDIS_PASSWORD: "secretpassword",
      REDIS_DB: "2",
      API_KEY: "my-super-secret-key",
      DASHBOARD_USERNAME: "superadmin",
      DASHBOARD_PASSWORD: "superpassword",
      DEFAULT_WORKER_CONCURRENCY: "10",
      JOB_RETENTION_COMPLETED_COUNT: "500",
      JOB_RETENTION_FAILED_COUNT: "2000",
      PROM_TICKETS_URL: "https://prometheus.internal/metrics",
      WA_API_URL: "https://wa.internal/api/send",
      WA_API_TOKEN: "custom-secret-wa-token",
      WA_FBSTAR_TARGET_NUMBER: "62899999999@g.us",
      NIS_IFORTE_TICKETS_URL: "https://custom.nis.local/tickets",
      NIS_TOKEN: "custom-nis-secret",
      WA_IFORTE_TARGET_NUMBER: "62811111111@g.us",
      NIS_EMPLOYEE_SUMMARY_URL: "https://custom.nis.local/employee-summary",
      WA_TICKET_SUMMARY_TARGET_NUMBER: "62822222222@g.us",
      DEFAULT_DEPARTMENT_ID: "42",
      DEFAULT_EXCLUDED_EMPLOYEE_IDS: "1001,1002",
      IFORTE_ZABBIX_URL: "https://zabbix.internal/rpc",
      IFORTE_ZABBIX_USERNAME: "zabbix_user",
      IFORTE_ZABBIX_PASSWORD: "zabbix_secret_pass",
      IFORTE_ZABBIX_GRAPH_NAME_FILTER: "NUSAFIBER-",
      IFORTE_GRAPH_ID_PREFIX: "custom-iforte-",
      NIS_GRAPH_SYNC_URL: "https://custom.nis.local/sync-graphs",
    });

    expect(custom.NODE_ENV).toBe("production");
    expect(custom.PORT).toBe(8080);
    expect(custom.REDIS_HOST).toBe("redis.internal");
    expect(custom.REDIS_PORT).toBe(6380);
    expect(custom.REDIS_PASSWORD).toBe("secretpassword");
    expect(custom.REDIS_DB).toBe(2);
    expect(custom.API_KEY).toBe("my-super-secret-key");
    expect(custom.DASHBOARD_USERNAME).toBe("superadmin");
    expect(custom.DASHBOARD_PASSWORD).toBe("superpassword");
    expect(custom.DEFAULT_WORKER_CONCURRENCY).toBe(10);
    expect(custom.JOB_RETENTION_COMPLETED_COUNT).toBe(500);
    expect(custom.JOB_RETENTION_FAILED_COUNT).toBe(2000);
    expect(custom.PROM_TICKETS_URL).toBe("https://prometheus.internal/metrics");
    expect(custom.WA_API_URL).toBe("https://wa.internal/api/send");
    expect(custom.WA_API_TOKEN).toBe("custom-secret-wa-token");
    expect(custom.WA_FBSTAR_TARGET_NUMBER).toBe("62899999999@g.us");
    expect(custom.NIS_IFORTE_TICKETS_URL).toBe("https://custom.nis.local/tickets");
    expect(custom.NIS_TOKEN).toBe("custom-nis-secret");
    expect(custom.WA_IFORTE_TARGET_NUMBER).toBe("62811111111@g.us");
    expect(custom.NIS_EMPLOYEE_SUMMARY_URL).toBe("https://custom.nis.local/employee-summary");
    expect(custom.WA_TICKET_SUMMARY_TARGET_NUMBER).toBe("62822222222@g.us");
    expect(custom.DEFAULT_DEPARTMENT_ID).toBe(42);
    expect(custom.DEFAULT_EXCLUDED_EMPLOYEE_IDS).toBe("1001,1002");
    expect(custom.IFORTE_ZABBIX_URL).toBe("https://zabbix.internal/rpc");
    expect(custom.IFORTE_ZABBIX_USERNAME).toBe("zabbix_user");
    expect(custom.IFORTE_ZABBIX_PASSWORD).toBe("zabbix_secret_pass");
    expect(custom.IFORTE_ZABBIX_GRAPH_NAME_FILTER).toBe("NUSAFIBER-");
    expect(custom.IFORTE_GRAPH_ID_PREFIX).toBe("custom-iforte-");
    expect(custom.NIS_GRAPH_SYNC_URL).toBe("https://custom.nis.local/sync-graphs");
  });

  it("should handle 0 correctly for numeric values and fallback invalid numbers", () => {
    const config = loadEnv({
      REDIS_DB: "0",
      PORT: "not-a-number",
    });
    expect(config.REDIS_DB).toBe(0);
    expect(config.PORT).toBe(3000);
  });

  it("should export a singleton env object", () => {
    expect(env).toBeDefined();
    expect(typeof env.PORT).toBe("number");
    expect(typeof env.REDIS_HOST).toBe("string");
  });
});
