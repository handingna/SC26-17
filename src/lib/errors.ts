import { z } from "zod";
import { MAX_REQUEST_BYTES } from "./schemas";
import type { ApiErrorBody } from "./types";

export type AppErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "REQUEST_TOO_LARGE"
  | "RATE_LIMITED"
  | "MODEL_UPSTREAM_ERROR"
  | "MODEL_OUTPUT_INVALID"
  | "MODEL_CONFIG_INVALID"
  | "MODEL_TIMEOUT"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(code: AppErrorCode, message: string, status: number, retryable: boolean, options?: ErrorOptions & { retryAfterSeconds?: number }) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return new AppError("INVALID_REQUEST", "请求内容无效，请检查后重试。", 400, false, { cause: error });
  }
  return new AppError("INTERNAL_ERROR", "服务暂时不可用，请稍后重试。", 500, true, { cause: error });
}

export function toApiErrorBody(error: AppError): ApiErrorBody {
  return { error: { code: error.code, message: error.message, retryable: error.retryable } };
}

export const API_RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Frame-Options": "DENY",
} as const;

export function responseHeadersForError(error: AppError): Record<string, string> {
  return error.retryAfterSeconds
    ? { ...API_RESPONSE_HEADERS, "Retry-After": String(error.retryAfterSeconds) }
    : { ...API_RESPONSE_HEADERS };
}

export async function readLimitedJson(request: Request): Promise<unknown> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US");
  if (mediaType !== "application/json") {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "请求 Content-Type 必须是 application/json。", 415, false);
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new AppError("REQUEST_TOO_LARGE", "请求内容不能超过 64 KiB。", 400, false);
  }
  if (!request.body) throw new AppError("INVALID_REQUEST", "请求内容不能为空。", 400, false);
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new AppError("REQUEST_TOO_LARGE", "请求内容不能超过 64 KiB。", 400, false);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("INVALID_REQUEST", "请求正文必须是有效的 UTF-8。", 400, false, { cause: error });
  } finally {
    reader.releaseLock();
  }
  if (!body.trim()) throw new AppError("INVALID_REQUEST", "请求内容不能为空。", 400, false);
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new AppError("INVALID_REQUEST", "请求必须是合法 JSON。", 400, false, { cause: error });
  }
}
