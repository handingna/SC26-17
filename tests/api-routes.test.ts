import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createDailyReading: vi.fn(),
  getModelConfig: vi.fn(),
}));

vi.mock("@/lib/daily-reading", () => ({
  createDailyReading: routeMocks.createDailyReading,
  PROMPT_VERSION: "style-v3-grounded-bazi-v4",
}));

vi.mock("@/lib/model-config", () => ({
  getModelConfig: routeMocks.getModelConfig,
}));

import { POST as postBirthChart } from "@/app/api/birth-chart/route";
import { POST as postDailyReading } from "@/app/api/daily-reading/route";
import { GET as getModelStatus } from "@/app/api/model-status/route";
import { AppError } from "@/lib/errors";
import { resetModelRateLimitForTests } from "@/lib/rate-limit";
import { MAX_REQUEST_BYTES } from "@/lib/schemas";
import { makeReading, validProfile, validWardrobe } from "./fixtures/factories";

const readyConfig = {
  state: "ready" as const,
  apiKey: "synthetic-key",
  configured: true,
  model: "synthetic-model",
  baseURL: "https://synthetic.invalid/v1",
  provider: "Synthetic Provider",
};

function jsonRequest(url: string, value: unknown, headers: HeadersInit = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
}

async function expectError(response: Response, expected: {
  status: number;
  code: string;
  retryable: boolean;
}) {
  expect(response.status).toBe(expected.status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json\b/i);
  await expect(response.json()).resolves.toEqual({
    error: {
      code: expected.code,
      message: expect.any(String),
      retryable: expected.retryable,
    },
  });
}

function expectPrivateJsonHeaders(response: Response) {
  expect(response.headers.get("content-type")).toMatch(/^application\/json\b/i);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
}

describe("API route contracts", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    routeMocks.createDailyReading.mockReset().mockResolvedValue(makeReading());
    routeMocks.getModelConfig.mockReset().mockReturnValue(readyConfig);
    resetModelRateLimitForTests();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires application/json before parsing a personalized POST body", async () => {
    const response = await postBirthChart(new Request("http://local.test/api/birth-chart", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ birthDate: "1992-02-02", birthTime: "12:00" }),
    }));
    await expectError(response, { status: 415, code: "UNSUPPORTED_MEDIA_TYPE", retryable: false });
    expectPrivateJsonHeaders(response);
  });

  it("rejects an actual body larger than 64 KiB with a unified error", async () => {
    const oversized = JSON.stringify({ padding: "字".repeat(MAX_REQUEST_BYTES) });
    const response = await postDailyReading(new Request("http://local.test/api/daily-reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversized,
    }));
    await expectError(response, { status: 400, code: "REQUEST_TOO_LARGE", retryable: false });
    expectPrivateJsonHeaders(response);
    expect(routeMocks.createDailyReading).not.toHaveBeenCalled();
  });

  it("returns bounded deterministic chart JSON with privacy/security headers", async () => {
    const response = await postBirthChart(jsonRequest("http://local.test/api/birth-chart", {
      birthDate: "1992-02-02",
      birthTime: "12:00",
    }));
    expect(response.status).toBe(200);
    expectPrivateJsonHeaders(response);
    await expect(response.json()).resolves.toMatchObject({
      pillars: {
        year: { stem: "辛", branch: "未" },
        month: { stem: "辛", branch: "丑" },
        day: { stem: "戊", branch: "申" },
        hour: { stem: "戊", branch: "午" },
      },
      timezone: "Asia/Shanghai",
      lateZiRule: "23:00-next-day",
    });
  });

  it("rate-limits only configured model generation and supplies Retry-After", async () => {
    const payload = { profile: validProfile, wardrobe: validWardrobe };
    for (let index = 0; index < 5; index += 1) {
      const response = await postDailyReading(jsonRequest("http://local.test/api/daily-reading", payload, {
        "x-forwarded-for": "198.51.100.8",
      }));
      expect(response.status).toBe(200);
    }
    const limited = await postDailyReading(jsonRequest("http://local.test/api/daily-reading", payload, {
      "x-forwarded-for": "198.51.100.8",
    }));
    await expectError(limited, { status: 429, code: "RATE_LIMITED", retryable: true });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(routeMocks.createDailyReading).toHaveBeenCalledTimes(5);
  });

  it("ignores spoofable proxy headers unless proxy trust is explicitly enabled", async () => {
    const payload = { profile: validProfile, wardrobe: validWardrobe };
    for (let index = 0; index < 5; index += 1) {
      const response = await postDailyReading(jsonRequest("http://local.test/api/daily-reading", payload, {
        "x-forwarded-for": `198.51.100.${index}`,
        "x-real-ip": `203.0.113.${index}`,
      }));
      expect(response.status).toBe(200);
    }
    const limited = await postDailyReading(jsonRequest("http://local.test/api/daily-reading", payload, {
      "x-forwarded-for": "192.0.2.99",
    }));
    await expectError(limited, { status: 429, code: "RATE_LIMITED", retryable: true });
  });

  it("uses proxy-provided client buckets only behind an explicitly trusted proxy", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const payload = { profile: validProfile, wardrobe: validWardrobe };
    for (let index = 0; index < 5; index += 1) {
      const response = await postDailyReading(jsonRequest("http://local.test/api/daily-reading", payload, {
        "x-forwarded-for": "198.51.100.10, 10.0.0.1",
      }));
      expect(response.status).toBe(200);
    }
    const differentClient = await postDailyReading(jsonRequest("http://local.test/api/daily-reading", payload, {
      "x-forwarded-for": "198.51.100.11",
    }));
    expect(differentClient.status).toBe(200);
    const limited = await postDailyReading(jsonRequest("http://local.test/api/daily-reading", payload, {
      "x-forwarded-for": "198.51.100.10",
    }));
    await expectError(limited, { status: 429, code: "RATE_LIMITED", retryable: true });
  });

  it.each([
    [new AppError("MODEL_UPSTREAM_ERROR", "模型上游不可用", 502, true), 502, "MODEL_UPSTREAM_ERROR"],
    [new AppError("MODEL_OUTPUT_INVALID", "模型输出无效", 502, true), 502, "MODEL_OUTPUT_INVALID"],
    [new AppError("MODEL_TIMEOUT", "模型响应超时", 504, true), 504, "MODEL_TIMEOUT"],
  ] as const)("preserves upstream error mapping %#", async (failure, status, code) => {
    routeMocks.createDailyReading.mockRejectedValueOnce(failure);
    const response = await postDailyReading(jsonRequest("http://local.test/api/daily-reading", {
      profile: validProfile,
      wardrobe: validWardrobe,
    }, { "x-forwarded-for": `203.0.113.${status}` }));
    await expectError(response, { status, code, retryable: true });
    expectPrivateJsonHeaders(response);
  });

  it("model status exposes provider metadata but never credentials or Base URL", async () => {
    const response = await getModelStatus();
    expect(response.status).toBe(200);
    expectPrivateJsonHeaders(response);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      state: "ready",
      configured: true,
      provider: "Synthetic Provider",
      model: "synthetic-model",
      promptVersion: "style-v3-grounded-bazi-v4",
      schemaVersion: "daily-reading-v4",
    });
    expect(body).not.toHaveProperty("apiKey");
    expect(body).not.toHaveProperty("baseURL");
    expect(JSON.stringify(body)).not.toContain("synthetic-key");
    expect(JSON.stringify(body)).not.toContain("synthetic.invalid");
  });
});
