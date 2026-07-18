"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ApiErrorBody,
  BirthChart,
  DailyReadingV4,
  ModelStatus,
  UserProfileV3,
  WardrobeItemV3,
} from "@/lib/types";
import {
  DEFAULT_PROMPT_VERSION,
  getDailyCacheKey,
  getRequestFingerprint,
  localDateKey,
} from "@/lib/cache-key";
import { demoReading } from "@/lib/demo-reading";
import { dailyReadingStorageSchema, isReadingCompatible, storage } from "@/lib/storage";

export type GenerationState =
  | { status: "idle" }
  | { status: "loading"; fingerprint: string; startedAt: number }
  | { status: "cancelled"; message: string }
  | { status: "error"; code: string; message: string; retryable: boolean };

export type ClientModelState = "ready" | "unconfigured" | "invalid" | "checking";

export function getClientModelState(status: ModelStatus | null): ClientModelState {
  if (!status) return "checking";
  const explicit = (status as ModelStatus & { state?: "ready" | "unconfigured" | "invalid" }).state;
  return explicit ?? (status.configured ? "ready" : "unconfigured");
}

interface UseDailyReadingOptions {
  profile: UserProfileV3 | null;
  wardrobe: WardrobeItemV3[] | null;
  birthChart: BirthChart | null;
  modelStatus: ModelStatus | null;
  hydrated: boolean;
  onStorageChange?: () => void;
  requestPrivacyConsent?: () => Promise<boolean>;
}

function statusContext(status: ModelStatus) {
  return {
    provider: status.provider,
    model: status.model,
    source: "model" as const,
    promptVersion: status.promptVersion,
    schemaVersion: status.schemaVersion,
  };
}

export function useDailyReading({
  profile,
  wardrobe,
  birthChart,
  modelStatus,
  hydrated,
  onStorageChange,
  requestPrivacyConsent,
}: UseDailyReadingOptions) {
  const [reading, setReading] = useState<DailyReadingV4 | null>(null);
  const [generation, setGeneration] = useState<GenerationState>({ status: "idle" });
  const [cacheHit, setCacheHit] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const activeFingerprintRef = useRef("");
  const readingRef = useRef<DailyReadingV4 | null>(null);
  const generationRef = useRef<GenerationState>({ status: "idle" });

  const updateGeneration = useCallback((next: GenerationState) => {
    generationRef.current = next;
    setGeneration(next);
  }, []);

  const inputFingerprint = useMemo(
    () => getRequestFingerprint(profile, wardrobe),
    [profile, wardrobe],
  );
  // Layout effects run at commit before promise callbacks can paint stale input.
  useLayoutEffect(() => {
    activeFingerprintRef.current = inputFingerprint;
  }, [inputFingerprint]);
  useLayoutEffect(() => {
    readingRef.current = reading;
  }, [reading]);
  useLayoutEffect(() => {
    generationRef.current = generation;
  }, [generation]);

  useEffect(() => {
    controllerRef.current?.abort();
    activeFingerprintRef.current = inputFingerprint;
    readingRef.current = null;
    generationRef.current = { status: "idle" };
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      updateGeneration({ status: "idle" });
      setReading(null);
      setCacheHit(false);
    });
    return () => { cancelled = true; };
  }, [hydrated, inputFingerprint, updateGeneration]);

  // Model-status completion must not abort a request or erase an explicit demo
  // result. It may only hydrate a compatible model cache for the same inputs.
  useEffect(() => {
    if (!hydrated || !profile || !wardrobe || !modelStatus || getClientModelState(modelStatus) !== "ready") return;
    if (generationRef.current.status !== "idle" || readingRef.current !== null) return;
    const key = getDailyCacheKey(profile, wardrobe, statusContext(modelStatus));
    const cached = storage.dailyReading(key);
    if (!cached || !isReadingCompatible(cached, profile, wardrobe)) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || generationRef.current.status !== "idle" || readingRef.current !== null) return;
      setReading(cached);
      setCacheHit(true);
    });
    return () => { cancelled = true; };
  }, [hydrated, inputFingerprint, modelStatus, profile, wardrobe]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const generate = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!profile || !profile.birthDate || !profile.birthTime || !profile.scenes.length || !profile.styles.length) {
      updateGeneration({ status: "error", code: "PROFILE_INCOMPLETE", message: "请先补全并保存出生日期、时间、常用场景与风格。", retryable: false });
      return false;
    }

    const modelState = getClientModelState(modelStatus);
    if (modelState === "invalid" || modelState === "unconfigured") {
      const message = modelState === "invalid"
        ? "模型配置无效，请先检查服务端设置；你仍可使用合成演示。"
        : modelState === "unconfigured"
          ? "当前未配置模型，可先使用合成演示。"
          : "当前模型不可用。";
      updateGeneration({ status: "error", code: "MODEL_NOT_READY", message, retryable: false });
      return false;
    }

    const items = wardrobe ?? [];
    const fingerprint = getRequestFingerprint(profile, items);
    activeFingerprintRef.current = fingerprint;

    if (!force && modelStatus) {
      const cacheKey = getDailyCacheKey(profile, items, statusContext(modelStatus));
      const cached = storage.dailyReading(cacheKey);
      if (cached && isReadingCompatible(cached, profile, items)) {
        setReading(cached);
        setCacheHit(true);
        updateGeneration({ status: "idle" });
        return true;
      }
    }

    if (!storage.privacyAccepted()) {
      const accepted = await requestPrivacyConsent?.();
      if (!accepted) return false;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    updateGeneration({ status: "loading", fingerprint, startedAt: Date.now() });
    setCacheHit(false);

    try {
      const response = await fetch("/api/daily-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, wardrobe: items }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        const apiError = body as Partial<ApiErrorBody> | null;
        throw Object.assign(new Error(apiError?.error?.message ?? "生成服务暂时不可用，请稍后重试。"), {
          code: apiError?.error?.code ?? "REQUEST_FAILED",
          retryable: apiError?.error?.retryable ?? response.status >= 500,
        });
      }

      const parsed = dailyReadingStorageSchema.safeParse(body);
      if (!parsed.success) {
        throw Object.assign(new Error("模型返回的数据结构未通过校验，请重试。"), { code: "MODEL_OUTPUT_INVALID", retryable: true });
      }
      const next = parsed.data as DailyReadingV4;
      if (!isReadingCompatible(next, profile, items, next.date)) {
        throw Object.assign(new Error("模型引用了不存在的衣物或未选择的场景，请重试。"), { code: "MODEL_OUTPUT_INVALID", retryable: true });
      }
      if (controller.signal.aborted || activeFingerprintRef.current !== fingerprint) return false;

      setReading(next);
      updateGeneration({ status: "idle" });
      if (next.source === "model") {
        const cacheKey = getDailyCacheKey(profile, items, {
          provider: next.provider,
          model: next.model,
          source: "model",
          promptVersion: next.promptVersion,
          schemaVersion: next.schemaVersion,
          algorithmVersion: next.birthChart.algorithmVersion,
        }, next.date);
        storage.setDailyReading(cacheKey, next);
        onStorageChange?.();
      }
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      const typed = error as Error & { code?: string; retryable?: boolean };
      updateGeneration({
        status: "error",
        code: typed.code ?? "REQUEST_FAILED",
        message: typed.message || "生成服务暂时不可用，请稍后重试。",
        retryable: typed.retryable ?? true,
      });
      return false;
    }
  }, [modelStatus, onStorageChange, profile, requestPrivacyConsent, updateGeneration, wardrobe]);

  const showDemoReading = useCallback(() => {
    if (!profile || !birthChart) {
      updateGeneration({ status: "error", code: "BIRTH_CHART_REQUIRED", message: "请先保存个人档案，完成本地排盘后再查看演示内容。", retryable: false });
      return false;
    }
    setReading(demoReading({
      date: localDateKey(),
      birthChart,
      profile,
      wardrobe: wardrobe ?? [],
      provider: "本地演示",
      model: "demo",
      promptVersion: DEFAULT_PROMPT_VERSION,
    }));
    setCacheHit(false);
    updateGeneration({ status: "idle" });
    return true;
  }, [birthChart, profile, updateGeneration, wardrobe]);

  const cancel = useCallback(() => {
    if (generationRef.current.status !== "loading") return;
    controllerRef.current?.abort();
    controllerRef.current = null;
    updateGeneration({ status: "cancelled", message: "已取消本次生成；档案和衣橱没有变化。" });
  }, [updateGeneration]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    activeFingerprintRef.current = "";
    setReading(null);
    setCacheHit(false);
    updateGeneration({ status: "idle" });
  }, [updateGeneration]);

  return { reading, generation, cacheHit, generate, showDemoReading, cancel, reset };
}
