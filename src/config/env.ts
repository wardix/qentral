export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB: number;
  API_KEY: string;
  DASHBOARD_USERNAME: string;
  DASHBOARD_PASSWORD: string;
  DEFAULT_WORKER_CONCURRENCY: number;
  JOB_RETENTION_COMPLETED_COUNT: number;
  JOB_RETENTION_FAILED_COUNT: number;
  PROM_TICKETS_URL: string;
  WA_API_URL: string;
  WA_API_TOKEN: string;
  WA_FBSTAR_TARGET_NUMBER: string;
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export function loadEnv(source: Record<string, string | undefined> = process.env): EnvConfig {
  return {
    NODE_ENV: source.NODE_ENV || "development",
    PORT: parseNumber(source.PORT, 3000),
    REDIS_HOST: source.REDIS_HOST || "127.0.0.1",
    REDIS_PORT: parseNumber(source.REDIS_PORT, 6379),
    REDIS_PASSWORD: source.REDIS_PASSWORD ?? "",
    REDIS_DB: parseNumber(source.REDIS_DB, 0),
    API_KEY: source.API_KEY || "ganti-dengan-kunci-rahasia-anda",
    DASHBOARD_USERNAME: source.DASHBOARD_USERNAME || "admin",
    DASHBOARD_PASSWORD: source.DASHBOARD_PASSWORD || "adminpassword",
    DEFAULT_WORKER_CONCURRENCY: parseNumber(source.DEFAULT_WORKER_CONCURRENCY, 5),
    JOB_RETENTION_COMPLETED_COUNT: parseNumber(source.JOB_RETENTION_COMPLETED_COUNT, 1000),
    JOB_RETENTION_FAILED_COUNT: parseNumber(source.JOB_RETENTION_FAILED_COUNT, 5000),
    PROM_TICKETS_URL: source.PROM_TICKETS_URL || "https://metrics.example.com/operator-tickets",
    WA_API_URL: source.WA_API_URL || "https://api.whatsapp.example.com/v2/messages",
    WA_API_TOKEN: source.WA_API_TOKEN || "",
    WA_FBSTAR_TARGET_NUMBER: source.WA_FBSTAR_TARGET_NUMBER || "",
  };
}

export const env = loadEnv();
