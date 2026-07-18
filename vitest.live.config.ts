import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/prompt-live.test.ts"],
    setupFiles: ["./tests/live-env.ts"],
    // This config is used only by the explicit `test:prompt:live` script.
    // Default `npm test` uses vitest.config.ts and never enables live calls.
    env: { RUN_PROMPT_LIVE: "1" },
    restoreMocks: true,
    clearMocks: true,
  },
});
