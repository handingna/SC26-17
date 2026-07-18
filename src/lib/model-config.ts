import "server-only";

const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

export type ModelConfigState = "ready" | "unconfigured" | "invalid";

export interface ModelConfig {
  state: ModelConfigState;
  configured: boolean;
  issueCode?: "MISSING_REQUIRED_FIELDS" | "INVALID_BASE_URL";
  apiKey?: string;
  model: string;
  baseURL?: string;
  provider: string;
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function validBaseURL(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const localHttp = process.env.NODE_ENV !== "production"
      && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLocaleLowerCase("en-US"));
    if (url.protocol !== "https:" && !localHttp) return undefined;
    return value.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function inferProvider(baseURL: string | undefined, explicit?: string): string {
  if (explicit) return explicit.slice(0, 80);
  try {
    if (baseURL && new URL(baseURL).hostname.toLocaleLowerCase("en-US") === "chat.ecnu.edu.cn") return "ECNU";
  } catch {
    // Invalid URLs are represented by the `invalid` state, never exposed.
  }
  return "OpenAI 兼容服务";
}

function invalidConfig(
  issueCode: "MISSING_REQUIRED_FIELDS" | "INVALID_BASE_URL",
  model?: string,
  baseURL?: string,
  provider?: string,
): ModelConfig {
  return {
    state: "invalid",
    configured: false,
    issueCode,
    model: model ?? "配置无效",
    provider: inferProvider(validBaseURL(baseURL), provider),
  };
}

export function getModelConfig(): ModelConfig {
  const aiRaw = {
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
    baseURL: process.env.AI_BASE_URL,
    provider: process.env.AI_PROVIDER_NAME,
  };
  // The display-only provider label must never select an otherwise incomplete
  // AI group and block a complete legacy configuration.
  const hasAiGroup = [aiRaw.apiKey, aiRaw.model, aiRaw.baseURL].some((value) => value !== undefined);
  if (hasAiGroup) {
    const apiKey = clean(aiRaw.apiKey);
    const model = clean(aiRaw.model);
    const rawBaseURL = clean(aiRaw.baseURL);
    const baseURL = validBaseURL(rawBaseURL);
    const provider = clean(aiRaw.provider);
    if (!apiKey || !model || !rawBaseURL) return invalidConfig("MISSING_REQUIRED_FIELDS", model, rawBaseURL, provider);
    if (!baseURL) return invalidConfig("INVALID_BASE_URL", model, rawBaseURL, provider);
    return {
      state: "ready",
      configured: true,
      apiKey,
      model,
      baseURL,
      provider: inferProvider(baseURL, provider),
    };
  }

  const legacyApiKey = clean(process.env.DEEPSEEK_API_KEY);
  const legacyModel = clean(process.env.DEEPSEEK_MODEL);
  const legacyRawBaseURL = clean(process.env.DEEPSEEK_BASE_URL);
  const hasLegacyGroup = Boolean(legacyApiKey || legacyModel || legacyRawBaseURL);
  if (!hasLegacyGroup) {
    return {
      state: "unconfigured",
      configured: false,
      model: "未配置",
      provider: "OpenAI 兼容服务",
    };
  }
  if (!legacyApiKey) return invalidConfig("MISSING_REQUIRED_FIELDS", legacyModel, legacyRawBaseURL);
  const rawBaseURL = legacyRawBaseURL ?? DEFAULT_DEEPSEEK_BASE_URL;
  const baseURL = validBaseURL(rawBaseURL);
  if (!baseURL) return invalidConfig("INVALID_BASE_URL", legacyModel, rawBaseURL);
  return {
    state: "ready",
    configured: true,
    apiKey: legacyApiKey,
    model: legacyModel ?? DEFAULT_DEEPSEEK_MODEL,
    baseURL,
    provider: inferProvider(baseURL),
  };
}
