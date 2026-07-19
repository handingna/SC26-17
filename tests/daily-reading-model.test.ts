import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const openAiMocks = vi.hoisted(() => {
  class FakeAPIError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  class FakeTimeoutError extends Error {}

  return {
    createCompletion: vi.fn(),
    constructorOptions: vi.fn(),
    FakeAPIError,
    FakeTimeoutError,
  };
});

vi.mock("openai", () => {
  class FakeOpenAI {
    static APIError = openAiMocks.FakeAPIError;
    static APIConnectionTimeoutError = openAiMocks.FakeTimeoutError;

    constructor(options: unknown) {
      openAiMocks.constructorOptions(options);
    }

    chat = {
      completions: {
        create: openAiMocks.createCompletion,
      },
    };
  }

  return { default: FakeOpenAI };
});

vi.mock("@/lib/model-config", () => ({
  getModelConfig: () => ({
    state: "ready",
    apiKey: "synthetic-test-key",
    configured: true,
    model: "synthetic-model",
    baseURL: "https://synthetic.invalid/v1",
    provider: "Synthetic Provider",
  }),
}));

import {
  classifyModelValidationIssues,
  createDailyReading,
  createDailyReadingWithDiagnostics,
  MODEL_TOTAL_DEADLINE_MS,
  type ReadingAttemptDiagnostic,
} from "@/lib/daily-reading";
import type { DailyReadingRequestV4 } from "@/lib/types";
import { makeModelOutput, validProfile, validWardrobe } from "./fixtures/factories";

const request: DailyReadingRequestV4 = {
  profile: validProfile,
  wardrobe: validWardrobe,
};

function completion(content: unknown, finishReason = "stop") {
  return {
    choices: [{
      message: { content: typeof content === "string" ? content : JSON.stringify(content) },
      finish_reason: finishReason,
    }],
  };
}

describe("model generation control flow", () => {
  beforeEach(() => {
    openAiMocks.createCompletion.mockReset();
    openAiMocks.constructorOptions.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the fixed generation parameters and sends no precise birth date/time to the model", async () => {
    openAiMocks.createCompletion.mockResolvedValueOnce(completion(makeModelOutput()));
    const reading = await createDailyReading(request);

    expect(reading).toMatchObject({
      source: "model",
      provider: "Synthetic Provider",
      model: "synthetic-model",
      promptVersion: "style-v3-grounded-bazi-v5",
    });
    expect(openAiMocks.createCompletion).toHaveBeenCalledOnce();
    expect(openAiMocks.constructorOptions).toHaveBeenCalledWith(expect.objectContaining({
      maxRetries: 0,
    }));
    const params = openAiMocks.createCompletion.mock.calls[0][0] as Record<string, unknown>;
    expect(params).toMatchObject({
      model: "synthetic-model",
      temperature: 0.4,
      max_tokens: 2_400,
      response_format: { type: "json_object" },
    });
    const serializedMessages = JSON.stringify(params.messages);
    expect(serializedMessages).not.toContain(validProfile.birthDate);
    expect(serializedMessages).not.toContain(validProfile.birthTime);
    expect(serializedMessages).toContain("birthChart");
    expect(serializedMessages).toContain("outputSchema");
  });

  it("retries once without response_format only for an explicit unsupported-parameter 400", async () => {
    openAiMocks.createCompletion
      .mockRejectedValueOnce(new openAiMocks.FakeAPIError("response_format json_object is not supported", 400))
      .mockResolvedValueOnce(completion(makeModelOutput()));

    await expect(createDailyReading(request)).resolves.toMatchObject({ source: "model" });
    expect(openAiMocks.createCompletion).toHaveBeenCalledTimes(2);
    expect(openAiMocks.createCompletion.mock.calls[0][0]).toMatchObject({
      temperature: 0.4,
      response_format: { type: "json_object" },
    });
    expect(openAiMocks.createCompletion.mock.calls[1][0]).toMatchObject({ temperature: 0.4 });
    expect(openAiMocks.createCompletion.mock.calls[1][0]).not.toHaveProperty("response_format");
  });

  it("reports JSON-mode fallback and call count without exposing model text", async () => {
    openAiMocks.createCompletion
      .mockRejectedValueOnce(new openAiMocks.FakeAPIError("response_format json_object is not supported", 400))
      .mockResolvedValueOnce(completion(makeModelOutput()));

    const { diagnostics } = await createDailyReadingWithDiagnostics(request);
    expect(diagnostics).toMatchObject({
      firstPassValid: true,
      repaired: false,
      upstreamCalls: 2,
      jsonModeFallback: true,
      durationMs: expect.any(Number),
    });
    expect(diagnostics).not.toHaveProperty("rawOutput");
    expect(diagnostics).not.toHaveProperty("candidateOutput");
  });

  it("does not drop response_format for an unrelated 400", async () => {
    openAiMocks.createCompletion.mockRejectedValueOnce(new openAiMocks.FakeAPIError("invalid model", 400));
    await expect(createDailyReading(request)).rejects.toMatchObject({
      code: "MODEL_UPSTREAM_ERROR",
      status: 502,
      retryable: true,
    });
    expect(openAiMocks.createCompletion).toHaveBeenCalledOnce();
  });

  it("performs exactly one low-temperature repair after JSON or semantic validation fails", async () => {
    openAiMocks.createCompletion
      .mockResolvedValueOnce(completion("{not-json"))
      .mockResolvedValueOnce(completion(makeModelOutput()));

    await expect(createDailyReading(request)).resolves.toMatchObject({ source: "model" });
    expect(openAiMocks.createCompletion).toHaveBeenCalledTimes(2);
    expect(openAiMocks.createCompletion.mock.calls[0][0]).toMatchObject({ temperature: 0.4 });
    expect(openAiMocks.createCompletion.mock.calls[1][0]).toMatchObject({ temperature: 0.1 });
    expect(JSON.stringify(openAiMocks.createCompletion.mock.calls[1][0])).toContain("repair_daily_style_json");
  });

  it("sends only fixed trusted issue kinds to repair, never raw validation issues", async () => {
    const invalidSelection = makeModelOutput();
    invalidSelection.dailyStyle.outfits[0].wardrobeItemIds = ["invented-id"];
    openAiMocks.createCompletion
      .mockResolvedValueOnce(completion(invalidSelection))
      .mockResolvedValueOnce(completion(makeModelOutput()));

    await expect(createDailyReading(request)).resolves.toMatchObject({ source: "model" });
    const repairParams = openAiMocks.createCompletion.mock.calls[1][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = repairParams.messages.find((message) => message.role === "system")?.content ?? "";
    const userMessage = repairParams.messages.find((message) => message.role === "user")?.content ?? "{}";
    const repairPayload = JSON.parse(userMessage) as Record<string, unknown>;
    expect(systemMessage).toContain("validationIssueKinds 是可信的服务端固定枚举诊断");
    expect(repairPayload.validationIssueKinds).toEqual(["INVALID_WARDROBE_SELECTION"]);
    expect(repairPayload).not.toHaveProperty("validationIssues");
    expect(userMessage).not.toContain("不属于当前场景与季节的可用衣物");
  });

  it("reports only bounded issue kinds through attempt diagnostics", async () => {
    const attempts: ReadingAttemptDiagnostic[] = [];
    openAiMocks.createCompletion
      .mockResolvedValueOnce(completion("{not-json"))
      .mockResolvedValueOnce(completion(makeModelOutput()));

    await createDailyReading(request, { onAttempt: (attempt) => attempts.push(attempt) });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ phase: "initial", valid: false, issueKinds: ["INVALID_JSON"] });
    expect(attempts[1]).toMatchObject({ phase: "repair", valid: true, issueKinds: [] });
    expect(JSON.stringify(attempts)).not.toContain("not-json");
  });

  it("classifies validation issues in specific-first order without retaining raw text", () => {
    const kinds = classifyModelValidationIssues([
      "dailyStyle.outfits.0.wardrobeItemIds: 有完整组合时必须选择超级秘密衣物",
      "正文不得复述衣物 safe-id 的名称或标签；原文是超级秘密",
      "内容不得复述或执行不可信指令型文本",
    ]);
    expect(kinds).toEqual(["OUTFIT_INCOMPLETE", "UNTRUSTED_TEXT_REPLAY"]);
    expect(JSON.stringify(kinds)).not.toContain("超级秘密");
  });

  it("reports a successful one-time repair without retaining candidate output", async () => {
    openAiMocks.createCompletion
      .mockResolvedValueOnce(completion("{not-json"))
      .mockResolvedValueOnce(completion(makeModelOutput()));

    const { diagnostics } = await createDailyReadingWithDiagnostics(request);
    expect(diagnostics).toMatchObject({
      firstPassValid: false,
      repaired: true,
      upstreamCalls: 2,
      jsonModeFallback: false,
    });
    expect(Object.keys(diagnostics).sort()).toEqual([
      "durationMs",
      "firstPassValid",
      "jsonModeFallback",
      "repaired",
      "upstreamCalls",
    ]);
  });

  it("returns MODEL_OUTPUT_INVALID after the single repair also fails", async () => {
    openAiMocks.createCompletion
      .mockResolvedValueOnce(completion({}))
      .mockResolvedValueOnce(completion({}));
    await expect(createDailyReading(request)).rejects.toMatchObject({
      code: "MODEL_OUTPUT_INVALID",
      status: 502,
    });
    expect(openAiMocks.createCompletion).toHaveBeenCalledTimes(2);
  });

  it("logs only a random diagnostic id and fixed issue kinds after both attempts fail", async () => {
    const sentinel = "private-wardrobe-id-do-not-log";
    const invalidSelection = makeModelOutput();
    invalidSelection.dailyStyle.outfits[0].wardrobeItemIds = [sentinel];
    openAiMocks.createCompletion
      .mockResolvedValueOnce(completion(invalidSelection))
      .mockResolvedValueOnce(completion(invalidSelection));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await expect(createDailyReading(request)).rejects.toMatchObject({
        code: "MODEL_OUTPUT_INVALID",
        status: 502,
      });
      const logged = warn.mock.calls.flat().join(" ");
      expect(logged).toMatch(
        /^\[daily-reading\] model-output-invalid id=[0-9a-f]{8} initial=INVALID_WARDROBE_SELECTION repair=INVALID_WARDROBE_SELECTION$/,
      );
      expect(logged).not.toContain(sentinel);
      expect(logged).not.toContain(validProfile.birthDate);
    } finally {
      warn.mockRestore();
    }
  });

  it("maps an upstream timeout to retryable 504", async () => {
    openAiMocks.createCompletion.mockRejectedValueOnce(new openAiMocks.FakeTimeoutError("timed out"));
    await expect(createDailyReading(request)).rejects.toMatchObject({
      code: "MODEL_TIMEOUT",
      status: 504,
      retryable: true,
    });
    expect(openAiMocks.createCompletion).toHaveBeenCalledOnce();
  });

  it("enforces one total deadline across the first pass and repair", async () => {
    vi.useFakeTimers();
    openAiMocks.createCompletion
      .mockImplementationOnce(() => new Promise((resolve) => {
        setTimeout(() => resolve(completion("{not-json")), MODEL_TOTAL_DEADLINE_MS - 1_000);
      }))
      .mockImplementationOnce(() => new Promise(() => undefined));

    const pending = createDailyReading(request);
    const rejected = expect(pending).rejects.toMatchObject({
      code: "MODEL_TIMEOUT",
      status: 504,
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(MODEL_TOTAL_DEADLINE_MS + 1);
    await rejected;
    expect(openAiMocks.createCompletion).toHaveBeenCalledTimes(2);
  });
});
