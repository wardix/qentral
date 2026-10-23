import { createQueue } from "./registry";

export const EMPLOYEE_SUMMARY_QUEUE_NAME = "employee-summary-queue";

export const employeeSummaryQueue = createQueue(EMPLOYEE_SUMMARY_QUEUE_NAME);
