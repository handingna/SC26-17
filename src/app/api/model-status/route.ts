import { NextResponse } from "next/server";
import { getModelConfig } from "@/lib/model-config";

export async function GET() {
  const config = getModelConfig();
  return NextResponse.json({ configured: config.configured, provider: config.provider, model: config.model, baseURL: config.baseURL, promptVersion: "style-v2" });
}
