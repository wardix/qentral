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

export interface IforteReminderJobData {
  to?: string;
  [key: string]: any;
}

export interface IforteReminderJobResult {
  sent: boolean;
  totalTickets: number;
  recipient?: string;
  sentAt?: string;
  message?: string;
}

export interface EmployeeSummaryJobData {
  to?: string;
  targetDate?: string;
  target_date?: string;
  departmentId?: number;
  department_id?: number;
  excludedEmployeeIds?: string;
  excluded_employee_ids?: string;
  [key: string]: any;
}

export interface EmployeeSummaryJobResult {
  sent: boolean;
  targetDate: string;
  totalTickets: number;
  totalEmployees: number;
  recipient?: string;
  sentAt?: string;
  message?: string;
}

export interface IforteGraphsSyncJobData {
  graphNameFilter?: string;
  graph_name_filter?: string;
  graphIdPrefix?: string;
  graph_id_prefix?: string;
  [key: string]: any;
}

export interface IforteGraphsSyncJobResult {
  success: boolean;
  totalGraphsFound: number;
  syncedCount: number;
  message?: string;
  syncedAt: string;
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
