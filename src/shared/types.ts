import type { JobsOptions } from "bullmq";

export interface BaseJobPayload<T = unknown> {
  traceId?: string;
  requestedBy?: string;
  timestamp?: string;
  data: T;
}

export interface PublishJobRequest<T = unknown> {
  jobName: string;
  data?: T;
  options?: JobsOptions;
}

export interface PublishJobResponse {
  success: boolean;
  message: string;
  queue: string;
  jobId: string;
}

export type JobProgress = number | object | string | boolean;

export interface JobStatusResponse<TResult = unknown> {
  id: string;
  name?: string;
  state: string;
  progress: JobProgress;
  result: TResult | null;
  failedReason: string | null;
}

export interface EmailJobData {
  to?: string;
  subject?: string;
  templateId?: string;
  shouldFail?: boolean;
  [key: string]: any;
}

export interface EmailJobResult {
  sent: boolean;
  recipient?: string;
  sentAt: string;
}

export interface FbstarReminderJobData {
  to?: string;
  [key: string]: any;
}

export interface FbstarReminderJobResult {
  sent: boolean;
  totalTickets: number;
  recipient?: string;
  sentAt?: string;
  message?: string;
}

export interface RepeatableJobInfo {
  key: string;
  name: string;
  id?: string | null;
  endDate?: number | null;
  tz?: string | null;
  pattern?: string | null;
  every?: number | null;
  next?: number;
}
