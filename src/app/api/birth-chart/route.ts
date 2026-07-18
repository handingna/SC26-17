import { NextResponse } from "next/server";
import { calculateBirthChart } from "@/lib/birth-chart";
import { API_RESPONSE_HEADERS, asAppError, readLimitedJson, responseHeadersForError, toApiErrorBody } from "@/lib/errors";
import { birthChartRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = birthChartRequestSchema.parse(await readLimitedJson(request));
    return NextResponse.json(calculateBirthChart(payload), { headers: API_RESPONSE_HEADERS });
  } catch (error) {
    const appError = asAppError(error);
    if (appError.status >= 500) console.error(`[birth-chart] ${appError.code}`);
    return NextResponse.json(toApiErrorBody(appError), { status: appError.status, headers: responseHeadersForError(appError) });
  }
}
