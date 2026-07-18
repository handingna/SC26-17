import { loadEnv } from "vite";

// Explicit live tests run outside Next.js, so load the same local server env in
// the worker. Secrets remain process-local and are never logged or serialized.
const localEnv = loadEnv("development", process.cwd(), "");
for (const key of [
  "AI_API_KEY", "AI_MODEL", "AI_BASE_URL", "AI_PROVIDER_NAME",
  "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "DEEPSEEK_BASE_URL",
]) {
  if (localEnv[key]) process.env[key] = localEnv[key];
}
