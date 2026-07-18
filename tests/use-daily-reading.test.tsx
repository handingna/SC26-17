import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDailyReading } from "@/hooks/use-daily-reading";
import { getDailyCacheKey, localDateKey } from "@/lib/cache-key";
import { storage } from "@/lib/storage";
import type { ModelStatus, UserProfileV3 } from "@/lib/types";
import { makeReading, validBirthChart, validProfile, validWardrobe } from "./fixtures/factories";

const modelStatus: ModelStatus = {
  state: "ready",
  configured: true,
  provider: "Synthetic Provider",
  model: "synthetic-model",
  promptVersion: "style-v3-grounded-bazi-v4",
  schemaVersion: "daily-reading-v4",
};

describe("useDailyReading async state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    storage.acceptPrivacy();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("aborts an in-flight request and prevents its stale response from replacing changed inputs", async () => {
    let resolveResponse!: (value: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => responsePromise,
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ profile }: { profile: UserProfileV3 }) => useDailyReading({
        profile,
        wardrobe: validWardrobe,
        birthChart: validBirthChart,
        modelStatus,
        hydrated: true,
      }),
      { initialProps: { profile: validProfile } },
    );

    let generationPromise!: Promise<boolean>;
    act(() => {
      generationPromise = result.current.generate();
    });
    await waitFor(() => expect(result.current.generation.status).toBe("loading"));
    const requestSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal | undefined;
    expect(requestSignal).toBeDefined();
    if (!requestSignal) throw new Error("request signal was not provided");
    expect(requestSignal.aborted).toBe(false);

    rerender({ profile: { ...validProfile, birthTime: "23:00" } });
    await waitFor(() => expect(requestSignal.aborted).toBe(true));
    expect(result.current.generation.status).toBe("idle");

    resolveResponse(new Response(JSON.stringify(makeReading()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await act(async () => {
      await expect(generationPromise).resolves.toBe(false);
    });
    expect(result.current.reading).toBeNull();
    expect(result.current.generation.status).toBe("idle");
  });

  it("does not abort an in-flight request merely because model status arrives", async () => {
    storage.setDailyReading(getDailyCacheKey(validProfile, validWardrobe, {
      provider: modelStatus.provider,
      model: modelStatus.model,
      source: "model",
      promptVersion: modelStatus.promptVersion,
      schemaVersion: modelStatus.schemaVersion,
    }), makeReading());
    let resolveResponse!: (value: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => responsePromise,
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ status }: { status: ModelStatus | null }) => useDailyReading({
        profile: validProfile,
        wardrobe: validWardrobe,
        birthChart: validBirthChart,
        modelStatus: status,
        hydrated: true,
      }),
      { initialProps: { status: null as ModelStatus | null } },
    );

    // Let the hook's initial input-reset microtask settle before simulating a click.
    await act(async () => Promise.resolve());

    let generationPromise!: Promise<boolean>;
    act(() => {
      generationPromise = result.current.generate();
    });
    await waitFor(() => expect(result.current.generation.status).toBe("loading"));
    const requestSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal | undefined;
    expect(requestSignal).toBeDefined();
    if (!requestSignal) throw new Error("request signal was not provided");

    rerender({ status: modelStatus });
    await act(async () => Promise.resolve());
    expect(requestSignal.aborted).toBe(false);
    expect(result.current.generation.status).toBe("loading");
    expect(result.current.reading).toBeNull();

    resolveResponse(new Response(JSON.stringify(makeReading()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await act(async () => {
      await expect(generationPromise).resolves.toBe(true);
    });
    expect(result.current.reading).toMatchObject({ source: "model" });
    expect(result.current.generation.status).toBe("idle");
  });

  it("makes zero network requests when privacy consent is declined", async () => {
    window.localStorage.clear();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const requestPrivacyConsent = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() => useDailyReading({
      profile: validProfile,
      wardrobe: validWardrobe,
      birthChart: validBirthChart,
      modelStatus,
      hydrated: true,
      requestPrivacyConsent,
    }));
    await act(async () => Promise.resolve());

    await act(async () => {
      await expect(result.current.generate()).resolves.toBe(false);
    });
    expect(requestPrivacyConsent).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.generation.status).toBe("idle");
  });

  it("sends exactly one request after explicit privacy consent", async () => {
    window.localStorage.clear();
    const reading = makeReading({ date: localDateKey(), generatedAt: new Date().toISOString() });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(reading), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const requestPrivacyConsent = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useDailyReading({
      profile: validProfile,
      wardrobe: validWardrobe,
      birthChart: validBirthChart,
      modelStatus,
      hydrated: true,
      requestPrivacyConsent,
    }));
    await act(async () => Promise.resolve());

    await act(async () => {
      await expect(result.current.generate()).resolves.toBe(true);
    });
    expect(requestPrivacyConsent).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("cancels an active request and preserves an explicit cancelled state", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useDailyReading({
      profile: validProfile,
      wardrobe: validWardrobe,
      birthChart: validBirthChart,
      modelStatus,
      hydrated: true,
    }));
    await act(async () => Promise.resolve());

    let pending!: Promise<boolean>;
    act(() => { pending = result.current.generate(); });
    await waitFor(() => expect(result.current.generation.status).toBe("loading"));
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    act(() => result.current.cancel());
    expect(signal.aborted).toBe(true);
    await act(async () => { await expect(pending).resolves.toBe(false); });
    expect(result.current.generation).toMatchObject({ status: "cancelled", message: expect.stringContaining("已取消") });
  });

  it("retries a retryable failure with force and recovers", async () => {
    const reading = makeReading({ date: localDateKey(), generatedAt: new Date().toISOString() });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: "MODEL_TIMEOUT", message: "模型响应超时", retryable: true },
      }), { status: 504, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(reading), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useDailyReading({
      profile: validProfile,
      wardrobe: validWardrobe,
      birthChart: validBirthChart,
      modelStatus,
      hydrated: true,
    }));
    await act(async () => Promise.resolve());

    await act(async () => { await expect(result.current.generate()).resolves.toBe(false); });
    expect(result.current.generation).toMatchObject({ status: "error", code: "MODEL_TIMEOUT", retryable: true });
    await act(async () => { await expect(result.current.generate({ force: true })).resolves.toBe(true); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.reading).toMatchObject({ source: "model" });
  });
});
