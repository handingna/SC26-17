import { NextResponse } from "next/server";
import { PROMPT_VERSION } from "@/lib/daily-reading";
import { API_RESPONSE_HEADERS } from "@/lib/errors";
import { getModelConfig } from "@/lib/model-config";
import { DAILY_READING_SCHEMA_VERSION } from "@/lib/schemas";
import type { ModelStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const config = getModelConfig();
  const status: ModelStatus = {
    state: config.state,
    configured: config.configured,
    ...(config.issueCode ? { issueCode: config.issueCode } : {}),
    provider: config.provider,
    model: config.model,
    promptVersion: PROMPT_VERSION,
    schemaVersion: DAILY_READING_SCHEMA_VERSION,
  };
  return NextResponse.json(status, { headers: API_RESPONSE_HEADERS });
}
