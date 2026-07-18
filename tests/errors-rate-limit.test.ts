import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  API_RESPONSE_HEADERS,
  AppError,
  asAppError,
  readLimitedJson,
  toApiErrorBody,
} from "@/lib/errors";
import { enforceModelRateLimit, resetModelRateLimitForTests } from "@/lib/rate-limit";
import { MAX_REQUEST_BYTES } from "@/lib/schemas";

describe("API error mapping and bounded JSON reads", () => {
  it("preserves typed errors and emits the unified public shape", () => {
    const error = new AppError("MODEL_TIMEOUT", "模型响应超时", 504, true);
    expect(asAppError(error)).toBe(error);
    expect(toApiErrorBody(error)).toEqual({
      error: { code: "MODEL_TIMEOUT", message: "模型响应超时", retryable: true },
    });
  });

  it("maps validation and JSON syntax errors to non-retryable 400", () => {
    const zodError = z.string().min(1).safeParse("");
    if (zodError.success) throw new Error("fixture must be invalid");
    expect(asAppError(zodError.error)).toMatchObject({ code: "INVALID_REQUEST", status: 400, retryable: false });
    expect(asAppError(new SyntaxError("bad json"))).toMatchObject({ code: "INVALID_REQUEST", status: 400, retryable: false });
  });

  it("maps unexpected failures to retryable 500 without leaking details", () => {
    const error = asAppError(new Error("secret upstream detail"));
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500, retryable: true });
    expect(error.message).not.toContain("secret upstream detail");
  });

  it("rejects empty, malformed, header-oversized, and actual-byte-oversized bodies", async () => {
    await expect(readLimitedJson(new Request("http://local.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "" })))
      .rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
    await expect(readLimitedJson(new Request("http://local.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })))
      .rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
    await expect(readLimitedJson(new Request("http://local.test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "content-length": String(MAX_REQUEST_BYTES + 1) },
      body: "{}",
    }))).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE", status: 400 });
    await expect(readLimitedJson(new Request("http://local.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "字".repeat(MAX_REQUEST_BYTES) }),
    }))).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE", status: 400 });
  });

  it("parses a bounded request and exposes baseline security headers", async () => {
    await expect(readLimitedJson(new Request("http://local.test", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: "{\"ok\":true}",
    })))
      .resolves.toEqual({ ok: true });
    expect(API_RESPONSE_HEADERS).toMatchObject({
      "Cache-Control": expect.stringContaining("no-store"),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
  });
});

describe("single-process demonstration rate limit", () => {
  beforeEach(() => resetModelRateLimitForTests());

  it("allows five requests per IP per minute and rejects the sixth with 429", () => {
    for (let index = 0; index < 5; index += 1) {
      expect(() => enforceModelRateLimit("synthetic-ip", 1_000 + index)).not.toThrow();
    }
    expect(() => enforceModelRateLimit("synthetic-ip", 1_005)).toThrowError(expect.objectContaining({
      code: "RATE_LIMITED",
      status: 429,
      retryable: true,
    }));
  });

  it("isolates identifiers and releases expired buckets", () => {
    for (let index = 0; index < 5; index += 1) enforceModelRateLimit("first-ip", index);
    expect(() => enforceModelRateLimit("second-ip", 5)).not.toThrow();
    expect(() => enforceModelRateLimit("first-ip", 60_001)).not.toThrow();
  });
});
