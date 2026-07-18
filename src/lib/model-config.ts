import "server-only";

const defaultModel = "deepseek-chat";
const defaultBaseURL = "https://api.deepseek.com/v1";

export function getModelConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const model = process.env.DEEPSEEK_MODEL?.trim() || defaultModel;
  const configuredBaseURL = process.env.DEEPSEEK_BASE_URL?.trim() || defaultBaseURL;
  const baseURL = configuredBaseURL.replace(/\/+$/, "");

  return { apiKey, configured: Boolean(apiKey), model, baseURL, provider: "DeepSeek" as const };
}
