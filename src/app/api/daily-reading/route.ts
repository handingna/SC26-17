import { NextResponse } from "next/server";
import { createDailyReading } from "@/lib/daily-reading";
import { API_RESPONSE_HEADERS, asAppError, readLimitedJson, responseHeadersForError, toApiErrorBody } from "@/lib/errors";
import { getModelConfig } from "@/lib/model-config";
import { enforceModelRateLimit } from "@/lib/rate-limit";
import { dailyReadingRequestV4Schema } from "@/lib/schemas";

export const runtime = "nodejs";

function clientIdentifier(request: Request): string {
  const trustProxyHeaders = process.env.TRUST_PROXY_HEADERS?.trim().toLocaleLowerCase("en-US") === "true";
  if (!trustProxyHeaders) return "direct-client";
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip")?.trim() || "direct-client").slice(0, 128);
}

export async function POST(request: Request) {
  try {
    const payload = dailyReadingRequestV4Schema.parse(await readLimitedJson(request));
    if (getModelConfig().state === "ready") enforceModelRateLimit(clientIdentifier(request));
    const reading = await createDailyReading(payload, { signal: request.signal });
    return NextResponse.json(reading, { headers: API_RESPONSE_HEADERS });
  } catch (error) {
    const appError = asAppError(error);
    if (appError.status >= 500) console.error(`[daily-reading] ${appError.code}`);
    return NextResponse.json(toApiErrorBody(appError), { status: appError.status, headers: responseHeadersForError(appError) });
  }
}
