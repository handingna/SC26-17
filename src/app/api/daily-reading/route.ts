import { NextRequest, NextResponse } from "next/server";
import { createDailyReading } from "@/lib/daily-reading";
import { DailyReadingRequest } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as DailyReadingRequest;
    const reading = await createDailyReading(payload);
    return NextResponse.json(reading);
  } catch (error) {
    console.error("每日灵感生成失败", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "暂时无法生成今日灵感，请稍后重试。" }, { status: 400 });
  }
}
