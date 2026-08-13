import "server-only";

/**
 * Typed client for the kie.ai job API.
 *
 * Contract (verified against docs.kie.ai, Aug 2026):
 *   POST https://api.kie.ai/api/v1/jobs/createTask   -> { code, msg, data: { taskId } }
 *   GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...
 *        -> { code, msg, data: { state, resultJson, failCode, failMsg, ... } }
 *
 * Two sharp edges worth knowing about:
 *  - `resultJson` is a JSON *string*, not an object. It has to be parsed, and it
 *    can be empty even on a `success` state, so parsing must be defensive.
 *  - `aspect_ratio` defaults to "1:1". Omitting it silently square-crops the
 *    photo, which chops the sides off a portrait face. Always send it.
 */

import { buildPrompt } from "./prompt";

const API_BASE = "https://api.kie.ai/api/v1/jobs";
const DEFAULT_MODEL = "google/nano-banana-edit";

export type TaskState = "waiting" | "queuing" | "generating" | "success" | "fail";

export type TaskRecord = {
  taskId: string;
  state: TaskState;
  resultUrls: string[];
  failCode?: string;
  failMsg?: string;
  progress?: number;
};

/** Distinguishes "the provider is unhappy" from "we sent something wrong". */
export class KieError extends Error {
  constructor(
    message: string,
    readonly code?: string | number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "KieError";
  }
}

function apiKey(): string {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new KieError("KIE_API_KEY is not configured.");
  return key;
}

function modelId(): string {
  return process.env.KIE_MODEL_ID || DEFAULT_MODEL;
}

async function kieFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  const { timeoutMs = 20_000, ...rest } = init;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: ac.signal,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        ...(rest.headers ?? {}),
      },
    });

    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new KieError(
        `kie.ai returned a non-JSON response (HTTP ${res.status}).`,
        res.status,
        res.status >= 500,
      );
    }

    // kie.ai signals failure through the body `code`, not always the HTTP status.
    const code = (body as { code?: number }).code;
    if (!res.ok || (typeof code === "number" && code !== 200)) {
      const msg = (body as { msg?: string }).msg || `HTTP ${res.status}`;
      throw new KieError(
        `kie.ai request failed: ${msg}`,
        code ?? res.status,
        res.status >= 500 || res.status === 429,
      );
    }
    return body;
  } catch (err) {
    if (err instanceof KieError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new KieError("kie.ai did not respond in time.", "timeout", true);
    }
    throw new KieError(
      err instanceof Error ? err.message : "Unknown kie.ai transport error.",
      undefined,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `imageUrl` must be publicly reachable — kie.ai fetches it server-side. That
 * is the whole reason the photo touches Vercel Blob at all, and why the caller
 * is responsible for deleting it the moment the job reaches a terminal state.
 */
export async function createEditTask(imageUrl: string): Promise<string> {
  const body = await kieFetch("/createTask", {
    method: "POST",
    body: JSON.stringify({
      model: modelId(),
      input: {
        prompt: buildPrompt(),
        image_urls: [imageUrl],
        output_format: "jpeg",
        // Must match the 3:4 lock applied in lib/imagePrep.ts, or the
        // before/after slider will not line up.
        aspect_ratio: "3:4",
      },
    }),
  });

  const taskId = (body as { data?: { taskId?: string } }).data?.taskId;
  if (!taskId) throw new KieError("kie.ai accepted the job but returned no taskId.");
  return taskId;
}

export async function getTask(taskId: string): Promise<TaskRecord> {
  const body = await kieFetch(
    `/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { method: "GET", timeoutMs: 15_000 },
  );

  const data = (body as { data?: Record<string, unknown> }).data;
  if (!data) throw new KieError("kie.ai returned an empty task record.");

  return {
    taskId: String(data.taskId ?? taskId),
    state: (data.state as TaskState) ?? "waiting",
    resultUrls: parseResultUrls(data.resultJson),
    failCode: data.failCode ? String(data.failCode) : undefined,
    failMsg: data.failMsg ? String(data.failMsg) : undefined,
    progress: typeof data.progress === "number" ? data.progress : undefined,
  };
}

/** `resultJson` arrives as a string and is empty until the job succeeds. */
function parseResultUrls(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as { resultUrls?: unknown };
    if (!Array.isArray(parsed.resultUrls)) return [];
    return parsed.resultUrls.filter((u): u is string => typeof u === "string");
  } catch {
    return [];
  }
}

/**
 * Pulls the finished image into memory. Deliberately returns bytes rather than
 * the URL: the kie.ai result URL stays alive for ~24h, so handing it to the
 * browser would leave a publicly reachable copy of the patient's face on a
 * third-party host long after the session ended. We fetch it once, hand the
 * bytes to the browser inline, and never surface the URL.
 */
export async function fetchResultBytes(url: string): Promise<Buffer> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
    if (!res.ok) {
      throw new KieError(`Could not download the result (HTTP ${res.status}).`, res.status, true);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) throw new KieError("The generated image was empty.");
    return buf;
  } catch (err) {
    if (err instanceof KieError) throw err;
    throw new KieError("Could not download the generated image.", undefined, true);
  } finally {
    clearTimeout(timer);
  }
}

export const TERMINAL_STATES: ReadonlySet<TaskState> = new Set(["success", "fail"]);
