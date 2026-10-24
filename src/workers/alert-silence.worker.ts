import { Worker, type WorkerOptions, type Job } from "bullmq";
import { getRedisConnection } from "../config/redis";
import { env } from "../config/env";
import { ALERT_SILENCE_QUEUE_NAME } from "../queues/alert-silence.queue";

export { ALERT_SILENCE_QUEUE_NAME };

export interface AlertMatcher {
  name: string;
  value: string;
  isRegex?: boolean;
}

export interface AlertSilenceJobData {
  attributes?: string;
  contact?: string;
  notify?: string;
  comment?: string;
  duration?: string;
  end?: string;
  startsAt?: string;
  matchers?: AlertMatcher[];
}

export interface AlertSilenceJobResult {
  success: boolean;
  silenceId?: string;
  comment: string;
  createdBy: string;
  startsAt: string;
  endsAt: string;
  matchers: AlertMatcher[];
  notified: boolean;
  notifiedTo?: string;
}

export function convertDurationToSeconds(timeStr: string): number {
  if (!timeStr || timeStr.length < 2) {
    throw new Error("Invalid time format");
  }
  const unit = timeStr.charAt(timeStr.length - 1);
  const value = parseInt(timeStr.slice(0, -1), 10);

  if (Number.isNaN(value)) {
    throw new Error("Invalid time format");
  }

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    case "w":
      return value * 604800;
    default:
      throw new Error("Invalid time format");
  }
}

export function parseSilenceAttributes(input: string): Record<string, string> {
  const INITIAL_STATE = 0;
  const READING_ATTRIBUTE = 1;
  const IN_QUOTE = 2;
  const READING_VALUE = 3;
  const AFTER_SEPARATOR = 4;

  const parsedAttributes: Record<string, string> = {};
  let currentQuoteCharacter = '"';
  let currentState = INITIAL_STATE;
  const attributeBuffer: string[] = [];
  const valueBuffer: string[] = [];

  function commitAttribute() {
    const attributeName = attributeBuffer.join("").trim();
    const attributeValue = valueBuffer.join("");
    if (attributeName) {
      parsedAttributes[attributeName] = attributeValue;
    }
    attributeBuffer.length = 0;
    valueBuffer.length = 0;
    currentState = INITIAL_STATE;
  }

  for (let i = 0; i < input.length; i++) {
    const currentCharacter = input[i];

    switch (currentState) {
      case INITIAL_STATE:
        if (currentCharacter === " " || currentCharacter === ",") continue;
        if (currentCharacter === "=") {
          throw new Error('Parsing error: "=" encountered without an attribute name.');
        }
        currentState = READING_ATTRIBUTE;
        attributeBuffer.push(currentCharacter);
        break;

      case READING_ATTRIBUTE:
        if (currentCharacter === "=") {
          currentState = AFTER_SEPARATOR;
        } else if (currentCharacter === " ") {
          throw new Error("Parsing error: Space encountered within an attribute name.");
        } else {
          attributeBuffer.push(currentCharacter);
        }
        break;

      case AFTER_SEPARATOR:
        if (currentCharacter === '"' || currentCharacter === "'") {
          currentState = IN_QUOTE;
          currentQuoteCharacter = currentCharacter;
        } else if (currentCharacter !== " ") {
          currentState = READING_VALUE;
          valueBuffer.push(currentCharacter);
        }
        break;

      case READING_VALUE:
        if (currentCharacter === " " || currentCharacter === ",") {
          commitAttribute();
        } else {
          valueBuffer.push(currentCharacter);
        }
        break;

      case IN_QUOTE:
        if (currentCharacter === currentQuoteCharacter) {
          commitAttribute();
        } else {
          valueBuffer.push(currentCharacter);
        }
        break;
    }
  }

  if (currentState === READING_VALUE) {
    commitAttribute();
  } else if (currentState !== INITIAL_STATE && currentState !== IN_QUOTE) {
    throw new Error("Parsing error: Input ended unexpectedly.");
  }

  return parsedAttributes;
}

export async function sendWaNotification(to: string, msg: string): Promise<void> {
  const safeTo = to.endsWith("@c.us") ? to.replace("@c.us", "") : to;
  await fetch(env.WA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.WA_API_TOKEN}`,
    },
    body: JSON.stringify({
      to: safeTo,
      body: "text",
      text: msg,
    }),
  });
}

export async function alertSilenceProcessor(
  job: Job<AlertSilenceJobData, AlertSilenceJobResult>
): Promise<AlertSilenceJobResult> {
  const { attributes, notify } = job.data || {};
  let contact = job.data?.contact || "";
  let comment = job.data?.comment;
  let duration = job.data?.duration;
  let end = job.data?.end;
  let matchers: AlertMatcher[] = job.data?.matchers ? [...job.data.matchers] : [];

  await job.updateProgress(10);
  await job.log(`[AlertSilence] Memproses job silence ID: ${job.id}`);

  try {
    if (attributes && attributes.trim() !== "") {
      const parsed = parseSilenceAttributes(attributes);
      if (parsed.comment !== undefined) comment = parsed.comment;
      if (parsed.duration !== undefined) duration = parsed.duration;
      if (parsed.end !== undefined) end = parsed.end;
      if (parsed.contact !== undefined && !contact) contact = parsed.contact;

      for (const [key, value] of Object.entries(parsed)) {
        if (!["comment", "duration", "end", "contact"].includes(key)) {
          matchers.push({
            name: key,
            value,
            isRegex: false,
          });
        }
      }
    }

    if (!comment) {
      throw new Error("`comment' attribute is required");
    }
    if (duration && end) {
      throw new Error("conflict attributes: `duration' and `end'");
    }
    if (!duration && !end) {
      throw new Error("`duration' or `end' attribute is required");
    }

    const now = new Date();
    const startTime = job.data?.startsAt ? new Date(job.data.startsAt) : now;
    const endTime = end
      ? new Date(end)
      : new Date(startTime.getTime() + convertDurationToSeconds(duration!) * 1000);

    const silenceData = {
      matchers,
      startsAt: startTime.toISOString(),
      endsAt: endTime.toISOString(),
      createdBy: contact || "qentral",
      comment,
    };

    await job.updateProgress(40);
    await job.log(`[AlertSilence] Mengirim data silence ke Alertmanager: ${JSON.stringify(silenceData)}`);

    const response = await fetch(env.SILENCE_ALERT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(silenceData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gagal submit silence ke Alertmanager: ${response.statusText}${errorText ? ` - ${errorText}` : ""}`);
    }

    let silenceId: string | undefined;
    try {
      const jsonRes = (await response.json()) as any;
      silenceId = jsonRes.silenceID || jsonRes.id;
    } catch {
      // response might not have json body
    }

    await job.updateProgress(80);

    let notified = false;
    if (notify && notify.trim() !== "") {
      await sendWaNotification(notify, "silenced");
      notified = true;
      await job.log(`[AlertSilence] Notifikasi WhatsApp dikirim ke ${notify}`);
    }

    await job.updateProgress(100);
    await job.log(`[AlertSilence] Selesai memproses silence. Silence ID: ${silenceId || "N/A"}`);

    return {
      success: true,
      silenceId,
      comment,
      createdBy: silenceData.createdBy,
      startsAt: silenceData.startsAt,
      endsAt: silenceData.endsAt,
      matchers,
      notified,
      notifiedTo: notified ? notify : undefined,
    };
  } catch (error: any) {
    await job.log(`[AlertSilence] Terjadi kesalahan: ${error.message}`);
    if (notify && notify.trim() !== "") {
      try {
        await sendWaNotification(notify, error.message);
      } catch (notifyErr: any) {
        await job.log(`[AlertSilence] Gagal mengirim notifikasi error WA: ${notifyErr.message}`);
      }
    }
    throw error;
  }
}

export function createAlertSilenceWorker(
  options?: Partial<WorkerOptions>
): Worker<AlertSilenceJobData, AlertSilenceJobResult> {
  const isTest = process.env.NODE_ENV === "test";
  return new Worker<AlertSilenceJobData, AlertSilenceJobResult>(
    ALERT_SILENCE_QUEUE_NAME,
    alertSilenceProcessor,
    {
      connection: getRedisConnection() as any,
      concurrency: env.DEFAULT_WORKER_CONCURRENCY,
      autorun: isTest ? false : true,
      ...options,
    }
  );
}
