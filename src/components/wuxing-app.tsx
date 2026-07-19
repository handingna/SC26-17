"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiErrorBody, BirthChart, DailyReadingV5, ModelStatus, UserProfileV3, WardrobeItemV3 } from "@/lib/types";
import { birthChartStorageSchema, storage } from "@/lib/storage";
import { useDailyReading } from "@/hooks/use-daily-reading";
import { AppNav, type AppSection } from "./app-nav";
import { createQuickDemoReading, QUICK_DEMO_BIRTH_CHART, QUICK_DEMO_PROFILE, SAMPLE_WARDROBE } from "./demo-data";
import { PrivacyDialog } from "./privacy-dialog";
import { ProfileView } from "./profile-view";
import { SettingsView } from "./settings-view";
import { TodayView } from "./today-view";
import { WardrobeView } from "./wardrobe-view";

const SECTIONS: AppSection[] = ["today", "profile", "wardrobe", "settings"];

function sectionFromHash(hash: string): AppSection | null {
  const value = hash.replace(/^#/, "") as AppSection;
  return SECTIONS.includes(value) ? value : null;
}

function isModelStatus(value: unknown): value is ModelStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Partial<ModelStatus>;
  return (status.state === "ready" || status.state === "unconfigured" || status.state === "invalid")
    && typeof status.configured === "boolean"
    && typeof status.provider === "string"
    && typeof status.model === "string"
    && typeof status.promptVersion === "string"
    && typeof status.schemaVersion === "string";
}

export function WuxingApp() {
  const [active, setActive] = useState<AppSection>("today");
  const [profile, setProfile] = useState<UserProfileV3 | null>(null);
  const [wardrobe, setWardrobe] = useState<WardrobeItemV3[] | null>(null);
  const [birthChart, setBirthChart] = useState<BirthChart | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [modelStatusError, setModelStatusError] = useState("");
  const [modelStatusLoading, setModelStatusLoading] = useState(true);
  const [chartError, setChartError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [cacheCount, setCacheCount] = useState(0);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoReading, setDemoReading] = useState<DailyReadingV5 | null>(null);
  const [privacyDialog, setPrivacyDialog] = useState({ open: false, consentMode: false });
  const lastChartInputRef = useRef("");
  const contentRef = useRef<HTMLElement>(null);
  const focusAfterNavigationRef = useRef(false);
  const privacyResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const statusControllerRef = useRef<AbortController | null>(null);

  const refreshStorageState = useCallback(() => {
    setCacheCount(storage.dailyReadingCount());
    setStorageError(storage.lastError());
  }, []);

  const navigate = useCallback((section: AppSection, replace = false) => {
    if (typeof window !== "undefined") {
      const nextHash = `#${section}`;
      if (window.location.hash !== nextHash) {
        window.history[replace ? "replaceState" : "pushState"](null, "", nextHash);
      }
    }
    focusAfterNavigationRef.current = true;
    setActive(section);
  }, []);

  useEffect(() => {
    const sync = () => {
      const section = sectionFromHash(window.location.hash);
      if (!section) return;
      focusAfterNavigationRef.current = true;
      setActive(section);
    };
    const initial = sectionFromHash(window.location.hash);
    if (initial) queueMicrotask(() => setActive(initial));
    else window.history.replaceState(null, "", "#today");
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  useEffect(() => {
    if (!focusAfterNavigationRef.current) return;
    focusAfterNavigationRef.current = false;
    requestAnimationFrame(() => {
      const heading = contentRef.current?.querySelector<HTMLElement>("h1");
      (heading ?? contentRef.current)?.focus({ preventScroll: true });
    });
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      storage.initialize();
      setProfile(storage.profile());
      setWardrobe(storage.wardrobe());
      setHydrated(true);
      refreshStorageState();
    });
    return () => { cancelled = true; };
  }, [refreshStorageState]);

  const loadModelStatus = useCallback(async () => {
    statusControllerRef.current?.abort();
    const controller = new AbortController();
    statusControllerRef.current = controller;
    setModelStatusLoading(true);
    setModelStatusError("");
    try {
      const response = await fetch("/api/model-status", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("模型状态接口暂时不可用。");
      const body = await response.json() as unknown;
      if (!isModelStatus(body)) throw new Error("模型状态格式异常。");
      setModelStatus(body);
    } catch (error) {
      if (!controller.signal.aborted) {
        setModelStatusError(error instanceof Error ? error.message : "模型状态检查失败。");
      }
    } finally {
      if (!controller.signal.aborted) setModelStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadModelStatus();
    });
    return () => {
      cancelled = true;
      statusControllerRef.current?.abort();
    };
  }, [loadModelStatus]);

  useEffect(() => {
    if (demoMode || !hydrated || !profile?.birthDate || !profile.birthTime) return;
    const inputKey = `${profile.birthDate}|${profile.birthTime}`;
    if (birthChart && lastChartInputRef.current === inputKey) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/birth-chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ birthDate: profile.birthDate, birthTime: profile.birthTime }),
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null) as unknown;
        if (!response.ok) {
          const error = body as Partial<ApiErrorBody> | null;
          throw new Error(error?.error?.message ?? "无法读取四柱结果。");
        }
        const parsed = birthChartStorageSchema.safeParse(body);
        if (!parsed.success) throw new Error("四柱结果格式异常。");
        setBirthChart(parsed.data as BirthChart);
        lastChartInputRef.current = inputKey;
        setChartError("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setBirthChart(null);
        setChartError(error instanceof Error ? error.message : "无法读取四柱结果。");
      }
    };
    void load();
    return () => controller.abort();
  }, [birthChart, demoMode, hydrated, profile]);

  const requestPrivacyConsent = useCallback(() => {
    if (storage.privacyAccepted()) return Promise.resolve(true);
    privacyResolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      privacyResolverRef.current = resolve;
      setPrivacyDialog({ open: true, consentMode: true });
    });
  }, []);

  const closePrivacyDialog = useCallback((accepted = false) => {
    if (accepted) {
      storage.acceptPrivacy();
      refreshStorageState();
    }
    privacyResolverRef.current?.(accepted);
    privacyResolverRef.current = null;
    setPrivacyDialog({ open: false, consentMode: false });
  }, [refreshStorageState]);

  useEffect(() => () => privacyResolverRef.current?.(false), []);

  const { reading, generation, cacheHit, generate, showDemoReading, cancel, reset } = useDailyReading({
    profile,
    wardrobe,
    birthChart,
    modelStatus,
    hydrated,
    onStorageChange: refreshStorageState,
    requestPrivacyConsent,
  });

  const startDemo = useCallback(() => {
    cancel();
    statusControllerRef.current?.abort();
    setModelStatusLoading(false);
    setDemoReading(createQuickDemoReading());
    setDemoMode(true);
    navigate("today");
  }, [cancel, navigate]);

  const exitDemo = useCallback(() => {
    setDemoMode(false);
    setDemoReading(null);
    navigate("today");
    void loadModelStatus();
  }, [loadModelStatus, navigate]);

  const saveProfile = (next: UserProfileV3, chart: BirthChart) => {
    if (demoMode) return false;
    const persisted = storage.setProfile(next);
    if (persisted) {
      lastChartInputRef.current = `${next.birthDate}|${next.birthTime}`;
      setProfile(next);
      setBirthChart(chart);
    }
    refreshStorageState();
    return persisted;
  };

  const saveWardrobe = (next: WardrobeItemV3[]) => {
    if (demoMode) return false;
    const persisted = storage.setWardrobe(next);
    if (persisted) setWardrobe(next);
    refreshStorageState();
    return persisted;
  };

  const skipWardrobe = () => {
    if (demoMode) return;
    if (wardrobe === null) {
      const persisted = storage.setWardrobe([]);
      if (!persisted) {
        refreshStorageState();
        return;
      }
      setWardrobe([]);
      refreshStorageState();
    }
    navigate("today");
  };

  const clearAll = () => {
    storage.clearAll();
    setProfile(null);
    setWardrobe(null);
    setBirthChart(null);
    lastChartInputRef.current = "";
    reset();
    refreshStorageState();
    navigate("today");
  };

  const effectiveProfile = demoMode ? QUICK_DEMO_PROFILE : profile;
  const effectiveWardrobe = demoMode ? SAMPLE_WARDROBE : wardrobe;
  const effectiveChart = demoMode ? QUICK_DEMO_BIRTH_CHART : birthChart;
  const effectiveReading = demoMode ? demoReading : reading;

  return (
    <div className={`app-shell${demoMode ? " demo-active" : ""}`}>
      <a
        className="skip-link"
        href="#app-content"
        onClick={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
      >跳到主要内容</a>
      <AppNav
        active={active}
        demoMode={demoMode}
        onChange={navigate}
        onOpenPrivacy={() => setPrivacyDialog({ open: true, consentMode: false })}
        onStartDemo={startDemo}
      />
      {demoMode && (
        <div className="demo-banner" role="status">
          <div><strong>合成演示</strong><span>固定示例仅存在于内存，不调用 API、模型或浏览器存储。</span></div>
          <button type="button" onClick={exitDemo}>退出演示</button>
        </div>
      )}
      {!demoMode && chartError && <div className="global-notice" role="alert">{chartError} 请在“个人档案”中重新保存。</div>}
      {!demoMode && storageError && active !== "settings" && <div className="global-notice storage" role="alert">{storageError}</div>}
      <main id="app-content" ref={contentRef} tabIndex={-1}>
        {active === "today" && (
          <TodayView
            hydrated={demoMode || hydrated}
            profile={effectiveProfile}
            birthChart={effectiveChart}
            wardrobe={effectiveWardrobe}
            reading={effectiveReading}
            modelStatus={modelStatus}
            modelStatusError={modelStatusError}
            modelStatusLoading={modelStatusLoading}
            generation={demoMode ? { status: "idle" } : generation}
            cacheHit={!demoMode && cacheHit}
            demoMode={demoMode}
            onCancel={cancel}
            onGenerate={(force = false, emotion) => { void generate({ force, currentEmotion: emotion }); }}
            onNavigate={navigate}
            onRetryModelStatus={() => { void loadModelStatus(); }}
            onStartDemo={startDemo}
            onUseDemo={() => { showDemoReading(); }}
          />
        )}
        {active === "wardrobe" && (demoMode || hydrated
          ? <WardrobeView key={demoMode ? "demo" : "real"} items={effectiveWardrobe} readOnly={demoMode} onNavigate={navigate} onSkipWardrobe={skipWardrobe} onChange={saveWardrobe} />
          : <div className="page narrow route-loading" role="status"><h1 tabIndex={-1}>正在读取衣橱…</h1></div>)}
        {active === "profile" && (demoMode || hydrated
          ? <ProfileView key={demoMode ? "demo" : "real"} profile={effectiveProfile} chart={effectiveChart} demoMode={demoMode} onNavigate={navigate} onSkipWardrobe={skipWardrobe} onSaved={saveProfile} />
          : <div className="page narrow route-loading" role="status"><h1 tabIndex={-1}>正在读取档案…</h1></div>)}
        {active === "settings" && (
          <SettingsView
            status={modelStatus}
            statusError={modelStatusError}
            statusLoading={modelStatusLoading}
            profile={effectiveProfile}
            wardrobe={effectiveWardrobe}
            cacheCount={demoMode ? 0 : cacheCount}
            storageError={demoMode ? null : storageError}
            demoMode={demoMode}
            onClear={clearAll}
            onOpenPrivacy={() => setPrivacyDialog({ open: true, consentMode: false })}
            onRetryStatus={() => { void loadModelStatus(); }}
          />
        )}
      </main>
      <PrivacyDialog
        open={privacyDialog.open}
        consentMode={privacyDialog.consentMode}
        onAccept={() => closePrivacyDialog(true)}
        onClose={() => closePrivacyDialog(false)}
      />
    </div>
  );
}
