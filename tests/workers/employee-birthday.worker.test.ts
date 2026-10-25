import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  employeeBirthdayProcessor,
  createEmployeeBirthdayWorker,
  EMPLOYEE_BIRTHDAY_QUEUE_NAME,
  getUpcomingDateRange,
  filterUpcomingBirthdays,
  formatUpcomingBirthdayMessage,
  resolveRecipientPhones,
  getNusaworkToken,
  fetchNusaworkEmployees,
  filterTodayBirthdays,
  renderBirthdayVoucher,
  formatPhoneNumber,
} from "../../src/workers/employee-birthday.worker";
import { env } from "../../src/config/env";

describe("Employee Birthday Worker & Processor", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset state before each test
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Utility & Domain Functions", () => {
    it("formatPhoneNumber should normalize 08 to 628, strip @c.us / @s.whatsapp.net, but preserve @lid and @g.us", () => {
      expect(formatPhoneNumber("081234567890")).toBe("6281234567890");
      expect(formatPhoneNumber("081234567890@c.us")).toBe("6281234567890");
      expect(formatPhoneNumber("6281234567890@s.whatsapp.net")).toBe("6281234567890");
      expect(formatPhoneNumber("120363028392819@g.us")).toBe("120363028392819@g.us");
      expect(formatPhoneNumber("201219301703927@lid")).toBe("201219301703927@lid");
    });

    it("getUpcomingDateRange should calculate 7 upcoming dates starting next Sunday", () => {
      // 2026-10-25 is a Sunday in Asia/Jakarta
      const sundayDate = new Date("2026-10-25T10:00:00+07:00");
      const nextWeek = getUpcomingDateRange(sundayDate);
      expect(nextWeek).toHaveLength(7);
      // Next Sunday is 2026-11-01
      expect(nextWeek[0]).toBe("01/11");
      expect(nextWeek[1]).toBe("02/11");
      expect(nextWeek[6]).toBe("07/11");
    });

    it("filterUpcomingBirthdays should filter matching employees and exclude internships", () => {
      const sundayDate = new Date("2026-10-25T10:00:00+07:00");
      // Next week is 01/11 to 07/11
      const employees = [
        {
          employee_id: "EMP01",
          full_name: "Budi Santoso",
          date_of_birth: "1990-11-02",
          status_join: "Permanent",
        },
        {
          employee_id: "EMP02",
          full_name: "Intern Andi",
          date_of_birth: "2002-11-03",
          status_join: "Internship", // must be excluded
        },
        {
          employee_id: "EMP03",
          full_name: "Siti Aminah",
          date_of_birth: "1995-11-01",
          status_join: "Contract",
        },
        {
          employee_id: "EMP04",
          full_name: "Far Outside",
          date_of_birth: "1992-12-15",
          status_join: "Permanent", // outside range
        },
      ];

      const result = filterUpcomingBirthdays(employees, sundayDate);
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.employee_id)).toEqual(["EMP01", "EMP03"]);
    });

    it("filterTodayBirthdays should match employees born today and exclude internships", () => {
      const todayDate = new Date("2026-10-25T10:00:00+07:00");
      const employees = [
        {
          employee_id: "EMP10",
          full_name: "Birthday Boy",
          date_of_birth: "1993-10-25",
          status_join: "Permanent",
        },
        {
          employee_id: "EMP11",
          full_name: "Birthday Intern",
          date_of_birth: "2001-10-25",
          status_join: "Internship", // exclude
        },
        {
          employee_id: "EMP12",
          full_name: "Tomorrow Person",
          date_of_birth: "1995-10-26",
          status_join: "Permanent",
        },
      ];

      const result = filterTodayBirthdays(employees, todayDate);
      expect(result).toHaveLength(1);
      expect(result[0].employee_id).toBe("EMP10");
    });

    it("filterTodayBirthdays should match targetDate string format MM-DD or YYYY-MM-DD", () => {
      const employees = [
        { employee_id: "EMP1", full_name: "Nov 3 User", date_of_birth: "1990-11-03", status_join: "Permanent" },
        { employee_id: "EMP2", full_name: "Nov 4 User", date_of_birth: "1992-11-04", status_join: "Permanent" },
      ];

      const res1 = filterTodayBirthdays(employees, "2026-11-03");
      expect(res1).toHaveLength(1);
      expect(res1[0].employee_id).toBe("EMP1");

      const res2 = filterTodayBirthdays(employees, "11-04");
      expect(res2).toHaveLength(1);
      expect(res2[0].employee_id).toBe("EMP2");
    });

    it("renderBirthdayVoucher should render text onto template and return PNG buffer", async () => {
      const buffer = await renderBirthdayVoucher({
        templatePath: "./assets/birthday-voucher-template.png",
        name: "Budi Santoso",
        endPeriodDate: new Date("2026-11-25T00:00:00+07:00"),
      });

      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(1000);
      // PNG header check: \x89PNG
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);
    });

    it("formatUpcomingBirthdayMessage should format message with Upcoming birthday header", () => {
      const employees = [
        { employee_id: "1", full_name: "Siti Aminah", date_of_birth: "1995-11-01" },
        { employee_id: "2", full_name: "Budi Santoso", date_of_birth: "1990-11-04" },
      ];

      const message = formatUpcomingBirthdayMessage(employees);
      expect(message).toBe("Upcoming birthday:\n11-01 Siti Aminah\n11-04 Budi Santoso");
    });

    it("resolveRecipientPhones should prioritize job data recipients or fallback to env", () => {
      expect(resolveRecipientPhones({ recipients: ["628111"] })).toEqual(["628111"]);
      expect(resolveRecipientPhones({ notify: "628222" })).toEqual(["628222"]);
      expect(resolveRecipientPhones({ notify: ["628222", "628333"] })).toEqual(["628222", "628333"]);
    });
  });

  describe("Nusawork API Client", () => {
    it("getNusaworkToken should post credentials and return access_token", async () => {
      globalThis.fetch = mock(async (url: any, init?: any) => {
        expect(init?.method).toBe("POST");
        expect(init?.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
        return new Response(JSON.stringify({ access_token: "mock-oauth-token" }), { status: 200 });
      }) as any;

      const token = await getNusaworkToken();
      expect(token).toBe("mock-oauth-token");
    });

    it("fetchNusaworkEmployees should post to employee filter with Bearer auth", async () => {
      globalThis.fetch = mock(async (url: any, init?: any) => {
        expect(init?.method).toBe("POST");
        expect(init?.headers?.Authorization).toBe("Bearer mock-oauth-token");
        return new Response(
          JSON.stringify({
            data: {
              list: [{ employee_id: "1", full_name: "Test User", date_of_birth: "1990-01-01" }],
            },
          }),
          { status: 200 }
        );
      }) as any;

      const list = await fetchNusaworkEmployees("mock-oauth-token");
      expect(list).toHaveLength(1);
      expect(list[0].full_name).toBe("Test User");
    });
  });

  describe("Processor Execution", () => {
    it("Case 1 (Happy Path - Upcoming Reminder): should fetch token, employees, sort chronologically, and send WA with 'Upcoming birthday:' header", async () => {
      const fixedNow = new Date("2026-10-25T10:00:00+07:00");
      const waSentPayloads: any[] = [];

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr === env.NUSAWORK_TOKEN_API_URL) {
          expect(init?.method).toBe("POST");
          return new Response(JSON.stringify({ access_token: "nusawork-token-secret" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr === env.NUSAWORK_EMPLOYEE_API_URL) {
          expect(init?.headers?.Authorization).toBe("Bearer nusawork-token-secret");
          return new Response(
            JSON.stringify({
              data: {
                list: [
                  {
                    employee_id: "1",
                    full_name: "Budi Santoso",
                    date_of_birth: "1992-11-04",
                    status_join: "Permanent",
                  },
                  {
                    employee_id: "2",
                    full_name: "Siti Aminah",
                    date_of_birth: "1995-11-01",
                    status_join: "Permanent",
                  },
                  {
                    employee_id: "3",
                    full_name: "Magang Joni",
                    date_of_birth: "2003-11-02",
                    status_join: "Internship",
                  },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (urlStr === env.WA_API_URL) {
          waSentPayloads.push(JSON.parse(init?.body as string));
          return new Response(JSON.stringify({ status: "success", message_id: "wa-100" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const updateProgressMock = mock(async (_progress: number) => {});
      const logMock = mock(async (_message: string) => {});

      const mockJob = {
        id: "bday-job-1",
        name: "upcoming-reminder",
        data: {
          referenceDate: fixedNow.toISOString(),
          recipients: ["628123456789", "628987654321"],
        },
        updateProgress: updateProgressMock,
        log: logMock,
      };

      const result = await employeeBirthdayProcessor(mockJob as any);

      expect(result.sent).toBe(true);
      expect(result.totalEmployees).toBe(2);
      expect(result.recipients).toEqual(["628123456789", "628987654321"]);
      expect(waSentPayloads).toHaveLength(2);

      const expectedMessage = "Upcoming birthday:\n11-01 Siti Aminah\n11-04 Budi Santoso";
      expect(waSentPayloads[0].text).toBe(expectedMessage);
      expect(waSentPayloads[0].to).toBe("628123456789");
      expect(waSentPayloads[1].text).toBe(expectedMessage);
      expect(waSentPayloads[1].to).toBe("628987654321");
    });

    it("Case 2 (Upcoming Reminder - No Employees Next Week): should early return without calling WA API", async () => {
      let waCalled = false;

      globalThis.fetch = mock(async (url: any) => {
        const urlStr = String(url);
        if (urlStr === env.NUSAWORK_TOKEN_API_URL) {
          return new Response(JSON.stringify({ access_token: "token-abc" }), { status: 200 });
        }
        if (urlStr === env.NUSAWORK_EMPLOYEE_API_URL) {
          return new Response(
            JSON.stringify({
              data: {
                list: [
                  {
                    employee_id: "10",
                    full_name: "Far Away",
                    date_of_birth: "1990-05-10",
                    status_join: "Permanent",
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }
        if (urlStr === env.WA_API_URL) {
          waCalled = true;
          return new Response(JSON.stringify({ status: "success" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "bday-job-2",
        name: "upcoming-reminder",
        data: {
          referenceDate: "2026-10-25T10:00:00+07:00",
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      const result = await employeeBirthdayProcessor(mockJob as any);

      expect(result.sent).toBe(false);
      expect(result.totalEmployees).toBe(0);
      expect(waCalled).toBe(false);
    });

    it("Case 7 (Happy Path - Daily Voucher with targetDate and sendToEmployee: false): should only send to notify and not to employee", async () => {
      const waSentPayloads: any[] = [];

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr === env.NUSAWORK_TOKEN_API_URL) {
          return new Response(JSON.stringify({ access_token: "nusawork-token-secret" }), { status: 200 });
        }
        if (urlStr === env.NUSAWORK_EMPLOYEE_API_URL) {
          return new Response(
            JSON.stringify({
              data: {
                list: [
                  {
                    employee_id: "EMP33",
                    full_name: "Nov Three",
                    date_of_birth: "1991-11-03",
                    mobile_phone: "081234567899",
                    status_join: "Permanent",
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }
        if (urlStr === env.WA_API_URL) {
          waSentPayloads.push(JSON.parse(init?.body as string));
          return new Response(JSON.stringify({ status: "success", message_id: "wa-img-custom" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "voucher-job-custom",
        name: "daily-voucher",
        data: {
          targetDate: "11-03",
          notify: "628999111222",
          sendToEmployee: false,
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      const result = await employeeBirthdayProcessor(mockJob as any);

      expect(result.sent).toBe(true);
      expect(result.totalEmployees).toBe(1);
      // ONLY sent to requester notify phone, NOT to employee's personal phone
      expect(waSentPayloads).toHaveLength(1);
      expect(waSentPayloads[0].to).toBe("628999111222");
      expect(waSentPayloads[0].body).toBe("image");
      expect(result.recipients).toEqual(["628999111222"]);
    });

    it("Case 9 (Daily Voucher with @lid notify): should send voucher to @lid without stripping @lid", async () => {
      const waSentPayloads: any[] = [];

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr === env.NUSAWORK_TOKEN_API_URL) {
          return new Response(JSON.stringify({ access_token: "nusawork-token-secret" }), { status: 200 });
        }
        if (urlStr === env.NUSAWORK_EMPLOYEE_API_URL) {
          return new Response(
            JSON.stringify({
              data: {
                list: [
                  {
                    employee_id: "EMP33",
                    full_name: "Nov Three",
                    date_of_birth: "1991-11-03",
                    mobile_phone: "081234567899",
                    status_join: "Permanent",
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }
        if (urlStr === env.WA_API_URL) {
          waSentPayloads.push(JSON.parse(init?.body as string));
          return new Response(JSON.stringify({ status: "success", message_id: "wa-img-lid" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "voucher-job-lid",
        name: "daily-voucher",
        data: {
          targetDate: "11-03",
          notify: "201219301703927@lid",
          sendToEmployee: false,
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      const result = await employeeBirthdayProcessor(mockJob as any);

      expect(result.sent).toBe(true);
      expect(waSentPayloads).toHaveLength(1);
      expect(waSentPayloads[0].to).toBe("201219301703927@lid");
      expect(result.recipients).toEqual(["201219301703927@lid"]);
    });

    it("Case 3 (Unhappy Path - Nusawork Token Error): should throw when token API fails", async () => {
      globalThis.fetch = mock(async (url: any) => {
        const urlStr = String(url);
        if (urlStr === env.NUSAWORK_TOKEN_API_URL) {
          return new Response("Unauthorized", { status: 401, statusText: "Unauthorized" });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "bday-job-3",
        name: "upcoming-reminder",
        data: {},
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      await expect(employeeBirthdayProcessor(mockJob as any)).rejects.toThrow(
        "Gagal mendapatkan token Nusawork: Unauthorized"
      );
    });

    it("Case 4 (Unhappy Path - WA API Failure): should throw when WA API fails", async () => {
      globalThis.fetch = mock(async (url: any) => {
        const urlStr = String(url);
        if (urlStr === env.NUSAWORK_TOKEN_API_URL) {
          return new Response(JSON.stringify({ access_token: "valid-token" }), { status: 200 });
        }
        if (urlStr === env.NUSAWORK_EMPLOYEE_API_URL) {
          return new Response(
            JSON.stringify({
              data: {
                list: [
                  {
                    employee_id: "1",
                    full_name: "Budi",
                    date_of_birth: "1990-11-01",
                    status_join: "Permanent",
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }
        if (urlStr === env.WA_API_URL) {
          return new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "bday-job-4",
        name: "upcoming-reminder",
        data: {
          referenceDate: "2026-10-25T10:00:00+07:00",
          recipients: ["628123456789"],
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      await expect(employeeBirthdayProcessor(mockJob as any)).rejects.toThrow("Gagal mengirim WhatsApp");
    });

    it("Case 5 (Happy Path - Daily Voucher): should render voucher image and send to birthday employee and CC to PIC", async () => {
      const fixedToday = new Date("2026-10-25T10:00:00+07:00");
      const waSentPayloads: any[] = [];

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr === env.NUSAWORK_TOKEN_API_URL) {
          return new Response(JSON.stringify({ access_token: "nusawork-token-secret" }), { status: 200 });
        }
        if (urlStr === env.NUSAWORK_EMPLOYEE_API_URL) {
          return new Response(
            JSON.stringify({
              data: {
                list: [
                  {
                    employee_id: "EMP01",
                    full_name: "Budi Santoso",
                    date_of_birth: "1994-10-25",
                    mobile_phone: "081234567890",
                    status_join: "Permanent",
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }
        if (urlStr === env.WA_API_URL) {
          waSentPayloads.push(JSON.parse(init?.body as string));
          return new Response(JSON.stringify({ status: "success", message_id: "wa-img-1" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "voucher-job-1",
        name: "daily-voucher",
        data: {
          referenceDate: fixedToday.toISOString(),
          ccPhones: ["628999888777"],
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      const result = await employeeBirthdayProcessor(mockJob as any);

      expect(result.sent).toBe(true);
      expect(result.totalEmployees).toBe(1);
      // Sent to 1 employee + 1 CC
      expect(waSentPayloads).toHaveLength(2);

      // Verify payload format
      expect(waSentPayloads[0].to).toBe("6281234567890"); // formatted from 081234567890
      expect(waSentPayloads[0].body).toBe("image");
      expect(waSentPayloads[0].image).toBeDefined();
      expect(waSentPayloads[0].caption).toBe(env.BIRTHDAY_WISHES);

      expect(waSentPayloads[1].to).toBe("628999888777");
      expect(waSentPayloads[1].body).toBe("image");
    });

    it("Case 6 (Daily Voucher - No Birthdays Today): should early return without sending WA", async () => {
      let waCalled = false;

      globalThis.fetch = mock(async (url: any) => {
        const urlStr = String(url);
        if (urlStr === env.NUSAWORK_TOKEN_API_URL) {
          return new Response(JSON.stringify({ access_token: "token-abc" }), { status: 200 });
        }
        if (urlStr === env.NUSAWORK_EMPLOYEE_API_URL) {
          return new Response(
            JSON.stringify({
              data: {
                list: [
                  {
                    employee_id: "EMP99",
                    full_name: "Someone Else",
                    date_of_birth: "1994-01-01",
                    status_join: "Permanent",
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }
        if (urlStr === env.WA_API_URL) {
          waCalled = true;
          return new Response(JSON.stringify({ status: "success" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "voucher-job-2",
        name: "daily-voucher",
        data: {
          referenceDate: "2026-10-25T10:00:00+07:00",
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      const result = await employeeBirthdayProcessor(mockJob as any);

      expect(result.sent).toBe(false);
      expect(result.totalEmployees).toBe(0);
      expect(waCalled).toBe(false);
    });

    it("Case 8 (Daily Voucher - No Birthdays for targetDate with notify): should notify requester via text", async () => {
      const waSentPayloads: any[] = [];

      globalThis.fetch = mock(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr === env.NUSAWORK_TOKEN_API_URL) {
          return new Response(JSON.stringify({ access_token: "token-abc" }), { status: 200 });
        }
        if (urlStr === env.NUSAWORK_EMPLOYEE_API_URL) {
          return new Response(
            JSON.stringify({
              data: {
                list: [
                  {
                    employee_id: "EMP99",
                    full_name: "Someone Else",
                    date_of_birth: "1994-01-01",
                    status_join: "Permanent",
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }
        if (urlStr === env.WA_API_URL) {
          waSentPayloads.push(JSON.parse(init?.body as string));
          return new Response(JSON.stringify({ status: "success" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const mockJob = {
        id: "voucher-job-no-bday",
        name: "daily-voucher",
        data: {
          targetDate: "12-25",
          notify: "628999111222",
        },
        updateProgress: mock(async () => {}),
        log: mock(async () => {}),
      };

      const result = await employeeBirthdayProcessor(mockJob as any);

      expect(result.sent).toBe(false);
      expect(result.totalEmployees).toBe(0);
      expect(waSentPayloads).toHaveLength(1);
      expect(waSentPayloads[0].to).toBe("628999111222");
      expect(waSentPayloads[0].body).toBe("text");
      expect(waSentPayloads[0].text).toContain("Tidak ada karyawan yang berulang tahun");
    });
  });

  describe("Worker Creation", () => {
    it("createEmployeeBirthdayWorker should create Worker with correct queue name", () => {
      const worker = createEmployeeBirthdayWorker();
      expect(worker).toBeDefined();
      expect(worker.name).toBe(EMPLOYEE_BIRTHDAY_QUEUE_NAME);
      expect(EMPLOYEE_BIRTHDAY_QUEUE_NAME).toBe("employee-birthday-queue");
    });
  });
});
