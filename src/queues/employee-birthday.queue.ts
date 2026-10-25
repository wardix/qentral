import { createQueue } from "./registry";

export const EMPLOYEE_BIRTHDAY_QUEUE_NAME = "employee-birthday-queue";

export const employeeBirthdayQueue = createQueue(EMPLOYEE_BIRTHDAY_QUEUE_NAME);
