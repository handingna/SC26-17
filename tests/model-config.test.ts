import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getModelConfig } from "@/lib/model-config";

const CONFIG_VARS = [
  "AI_API_KEY",
  "AI_MODEL",
  "AI_BASE_URL",
  "AI_PROVIDER_NAME",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
  "DEEPSEEK_BASE_URL",
] as const;

function clearModelEnvironment() {
  for (const name of CONFIG_VARS) vi.stubEnv(name, undefined);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("atomic model configuration selection", () => {
  it("uses a complete AI_* group atomically and ignores legacy values", () => {
    clearModelEnvironment();
    vi.stubEnv("AI_API_KEY", "ai-key");
    vi.stubEnv("AI_MODEL", "ecnu-max");
    vi.stubEnv("AI_BASE_URL", "https://chat.ecnu.edu.cn/open/api/v1///");
    vi.stubEnv("AI_PROVIDER_NAME", "ECNU");
    vi.stubEnv("DEEPSEEK_API_KEY", "legacy-key");
    vi.stubEnv("DEEPSEEK_MODEL", "legacy-model");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://legacy.invalid/v1");

    expect(getModelConfig()).toEqual({
      state: "ready",
      apiKey: "ai-key",
      configured: true,
      model: "ecnu-max",
      baseURL: "https://chat.ecnu.edu.cn/open/api/v1",
      provider: "ECNU",
    });
  });

  it.each(["AI_API_KEY", "AI_MODEL", "AI_BASE_URL"] as const)(
    "marks a partial AI_* group invalid instead of filling %s from DEEPSEEK_*",
    (missing) => {
      clearModelEnvironment();
      const ai = {
        AI_API_KEY: "ai-key",
        AI_MODEL: "ecnu-max",
        AI_BASE_URL: "https://chat.ecnu.edu.cn/open/api/v1",
      } as const;
      for (const [name, value] of Object.entries(ai)) {
        if (name !== missing) vi.stubEnv(name, value);
      }
      vi.stubEnv("DEEPSEEK_API_KEY", "legacy-key");
      vi.stubEnv("DEEPSEEK_MODEL", "legacy-model");
      vi.stubEnv("DEEPSEEK_BASE_URL", "https://legacy.invalid/v1");

      const config = getModelConfig();
      expect(config.state).toBe("invalid");
      expect(config.configured).toBe(false);
      expect(config).not.toMatchObject({
        apiKey: "legacy-key",
        model: "legacy-model",
        baseURL: "https://legacy.invalid/v1",
      });
    },
  );

  it("uses the legacy group only when every AI_* selector is absent", () => {
    clearModelEnvironment();
    vi.stubEnv("DEEPSEEK_API_KEY", "legacy-key");

    expect(getModelConfig()).toMatchObject({
      state: "ready",
      configured: true,
      apiKey: "legacy-key",
      model: "deepseek-chat",
      baseURL: "https://api.deepseek.com/v1",
    });
  });

  it("treats AI_PROVIDER_NAME as display-only and still permits complete legacy fallback", () => {
    clearModelEnvironment();
    vi.stubEnv("AI_PROVIDER_NAME", "Display label only");
    vi.stubEnv("DEEPSEEK_API_KEY", "legacy-key");

    expect(getModelConfig()).toMatchObject({
      state: "ready",
      configured: true,
      apiKey: "legacy-key",
      model: "deepseek-chat",
      baseURL: "https://api.deepseek.com/v1",
    });
  });

  it("reports an explicit unconfigured state without leaking a placeholder key", () => {
    clearModelEnvironment();
    const config = getModelConfig();
    expect(config).toMatchObject({ state: "unconfigured", configured: false });
    expect(config.apiKey).toBeUndefined();
  });
});
