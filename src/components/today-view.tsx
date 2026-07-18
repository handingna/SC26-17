"use client";

import { useEffect, useState } from "react";
import type { BirthChart, ColorToken, DailyReadingV4, ModelStatus, UserProfileV3, WardrobeItemV3 } from "@/lib/types";
import { getClientModelState, type GenerationState } from "@/hooks/use-daily-reading";
import type { AppSection } from "./app-nav";
import { BirthChartCard } from "./birth-chart-card";

function Palette({ title, colors, emptyText }: { title: string; colors: ColorToken[]; emptyText: string }) {
  return (
    <article className="palette">
      <h3>{title}</h3>
      {colors.length ? colors.map((color) => (
        <div className="color-row" key={`${title}-${color.name}-${color.hex}`}>
          <i style={{ backgroundColor: color.hex }} aria-hidden="true" />
          <div><strong>{color.name}</strong><span>{color.note}</span><code>{color.hex}</code></div>
        </div>
      )) : <p className="palette-empty">{emptyText}</p>}
    </article>
  );
}

function GenerationSkeleton({ startedAt, onCancel }: { startedAt: number; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <section className="generation-progress" role="status" aria-live="polite" aria-busy="true">
      <div className="generation-progress-copy">
        <div><span className="loading-mark" aria-hidden="true" /><div><strong>正在整理配色与衣橱</strong><p>已用 {(elapsed / 1000).toFixed(1)} 秒 · 通常会在 20 秒内完成</p></div></div>
        <button className="outline" type="button" onClick={onCancel}>取消生成</button>
      </div>
      <div className="skeleton-grid" aria-hidden="true">
        <i /><i /><i />
      </div>
    </section>
  );
}

export function TodayView({
  hydrated,
  profile,
  birthChart,
  wardrobe,
  reading,
  modelStatus,
  modelStatusError = "",
  modelStatusLoading = false,
  generation,
  cacheHit,
  demoMode = false,
  onCancel = () => undefined,
  onGenerate,
  onUseDemo,
  onStartDemo = () => undefined,
  onRetryModelStatus = () => undefined,
  onNavigate,
}: {
  hydrated: boolean;
  profile: UserProfileV3 | null;
  birthChart: BirthChart | null;
  wardrobe: WardrobeItemV3[] | null;
  reading: DailyReadingV4 | null;
  modelStatus: ModelStatus | null;
  modelStatusError?: string;
  modelStatusLoading?: boolean;
  generation: GenerationState;
  cacheHit: boolean;
  demoMode?: boolean;
  onCancel?: () => void;
  onGenerate: (force?: boolean) => void;
  onUseDemo: () => void;
  onStartDemo?: () => void;
  onRetryModelStatus?: () => void;
  onNavigate: (section: AppSection) => void;
}) {
  const complete = Boolean(profile?.birthDate && profile.birthTime && profile.scenes.length && profile.styles.length);
  const wardrobeReady = wardrobe !== null;
  const style = reading?.dailyStyle;
  const chart = reading?.birthChart ?? birthChart;
  const loading = generation.status === "loading";
  const modelState = getClientModelState(modelStatus);
  const canGenerate = modelState === "ready" || modelState === "checking";
  const previewOutfit = style?.outfits[0];
  const previewItems = previewOutfit?.wardrobeItemIds
    .map((id) => (wardrobe ?? []).find((item) => item.id === id && item.enabled))
    .filter((item): item is WardrobeItemV3 => Boolean(item)) ?? [];

  return (
    <div className="page">
      <section className="journey" aria-labelledby="journey-title">
        <div><p className="eyebrow">THREE STEPS</p><h2 id="journey-title">从资料到今日穿搭</h2></div>
        <ol>
          <li className={complete ? "done" : "current"}><span>1</span><div><strong>完成档案</strong><small>{complete ? "已准备" : "约 1 分钟"}</small></div></li>
          <li className={wardrobeReady ? "done" : complete ? "current" : ""}><span>2</span><div><strong>准备衣橱</strong><small>{wardrobeReady ? `${wardrobe?.length ?? 0} 件单品` : "可直接跳过"}</small></div></li>
          <li className={reading ? "done" : complete ? "current" : ""}><span>3</span><div><strong>生成灵感</strong><small>{reading ? "今日结果就绪" : "配色与穿搭"}</small></div></li>
        </ol>
      </section>

      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">DAILY STYLE · {reading?.date ?? "ASIA / SHANGHAI"}</p>
            <span className="orb" aria-hidden="true">日</span>
            <p className="theme-label">{style?.theme ?? "东方色彩与日常穿搭"}</p>
            <h1 tabIndex={-1}>{style?.title ?? "从透明计算，走向轻松日常"}</h1>
            <p className="hero-copy">{style?.energy ?? "完成档案、准备衣橱，再把确定性计算转译成轻松可选的配色与穿搭。也可以先用固定合成示例完整体验。"}</p>

            {!hydrated ? (
              <p className="inline-loading" role="status">正在读取浏览器中的档案与衣橱…</p>
            ) : demoMode ? (
              <div className="hero-actions"><span className="source-badge demo">固定合成结果</span></div>
            ) : !complete ? (
              <div className="hero-actions onboarding-actions">
                <button className="primary" type="button" onClick={onStartDemo}>快速体验合成示例 <span>→</span></button>
                <button className="outline" type="button" onClick={() => onNavigate("profile")}>建立自己的档案</button>
              </div>
            ) : (
              <div className="hero-actions" aria-live="polite" aria-busy={loading}>
                {canGenerate ? (
                  <button className="primary" type="button" disabled={loading} onClick={() => onGenerate(Boolean(reading))}>
                    {loading ? "正在生成…" : reading ? "重新生成（绕过缓存）" : "生成今日灵感"}<span>→</span>
                  </button>
                ) : (
                  <button className="primary" type="button" onClick={onUseDemo}>查看演示内容 <span>→</span></button>
                )}
                {!reading && <button className="outline" type="button" onClick={onStartDemo}>{canGenerate ? "先看合成示例" : "快速体验合成示例"}</button>}
                {reading?.source === "model" && <span className="source-badge model">模型生成</span>}
                {reading?.source === "demo" && <span className="source-badge demo">演示内容</span>}
              </div>
            )}

            {cacheHit && <p className="cache-note">已使用今天相同档案、衣橱、算法与模型版本的缓存结果；可点击“重新生成”绕过缓存。</p>}
            {!demoMode && canGenerate && complete && !reading && (
              <p className="privacy-note">首次真实生成会打开站内数据确认；精确生日与时间不会发送给第三方模型。</p>
            )}
            {!demoMode && (modelStatusError || modelState === "invalid") && (
              <div className="status-inline" role="status">
                <p>{modelState === "invalid" ? "模型配置无效，暂时不会尝试真实生成。" : modelStatusError}</p>
                <button className="text-button neutral" type="button" disabled={modelStatusLoading} onClick={onRetryModelStatus}>{modelStatusLoading ? "正在重试…" : "重试模型状态"}</button>
              </div>
            )}
            <div aria-live="polite">
              {generation.status === "error" && (
                <div className="generation-error" role="alert">
                  <strong>未能生成</strong><p>{generation.message}</p>
                  <div className="error-actions">
                    {generation.retryable && <button className="text-button" type="button" onClick={() => onGenerate(true)}>重试生成</button>}
                    {birthChart && <button className="text-button" type="button" onClick={onUseDemo}>使用演示内容</button>}
                  </div>
                </div>
              )}
              {generation.status === "cancelled" && (
                <div className="generation-cancelled" role="status"><p>{generation.message}</p><button className="text-button neutral" type="button" onClick={() => onGenerate(true)}>重试生成</button></div>
              )}
            </div>
          </div>
          <aside className="result-preview" aria-label={reading ? "今日结果预览" : "合成结果预览"}>
            <div className="preview-top"><span>{reading ? "今日成品预览" : "合成示例预览"}</span><small>{reading ? reading.dailyStyle.theme : "夏日留白"}</small></div>
            <div className="preview-swatches" aria-label="主色预览">
              {(style?.primaryColors ?? [
                { name: "玉白", hex: "#F5F2E8", note: "" },
                { name: "苔藓绿", hex: "#667A51", note: "" },
                { name: "雾蓝", hex: "#91A8B9", note: "" },
              ]).slice(0, 3).map((color) => <i key={color.hex} style={{ background: color.hex }} title={color.name} />)}
            </div>
            <div className="preview-outfit">
              <p className="eyebrow">{previewOutfit?.scene ?? "通勤"} OUTFIT</p>
              <h2>{previewOutfit?.title ?? "玉白上装与自然色下装"}</h2>
              <p>{previewItems.length ? previewItems.map((item) => item.name).join(" + ") : "玉白短袖衬衫 + 苔藓绿直筒裤"}</p>
            </div>
            <p className="trust-tag">透明计数 · 不推算流日吉凶或人生结果</p>
            {modelState === "invalid" && <em>模型配置无效，真实生成已暂停。</em>}
            {modelState === "ready" && modelStatus && <em>{modelStatus.provider} · {modelStatus.model}</em>}
          </aside>
        </div>
      </section>

      {generation.status === "loading" && <GenerationSkeleton startedAt={generation.startedAt} onCancel={onCancel} />}

      {!loading && !reading && complete && chart && (
        <section className="reading-placeholder">
          <p className="eyebrow">READY FOR STYLE</p>
          <h2>计算已完成，等待生成穿搭灵感</h2>
          <p>衣橱可以为空；模型会明确列出缺少的单品，不会把建议伪装成已有衣物。</p>
          <details className="inline-chart-details"><summary>查看四柱与计算口径</summary><BirthChartCard chart={chart} compact /></details>
        </section>
      )}

      {!loading && reading && style && (
        <>
          <section className="color-section result-first">
            <div className="section-heading"><p className="eyebrow">COLOR DIRECTION</p><h2>今日色彩方向</h2><p>先看可以直接使用的配色；“少量使用”只是面积建议，不代表不吉利。</p></div>
            <div className="palette-grid">
              <Palette title="主色方向" colors={style.primaryColors} emptyText="暂无主色建议" />
              <Palette title="辅助色" colors={style.supportingColors} emptyText="无需额外辅助色" />
              <Palette title="少量使用" colors={style.useSparinglyColors} emptyText="没有需要特别控制的颜色" />
            </div>
          </section>

          <section className="outfit-section">
            <div className="section-heading"><p className="eyebrow">OUTFIT NOTES</p><h2>把灵感穿进日常</h2><p>卡片只展示结果返回且仍存在于当前衣橱的真实单品。</p></div>
            <div className="outfit-grid">
              {style.outfits.map((outfit, index) => {
                const matched = outfit.wardrobeItemIds
                  .map((id) => (wardrobe ?? []).find((item) => item.id === id && item.enabled))
                  .filter((item): item is WardrobeItemV3 => Boolean(item));
                return (
                  <article className="outfit-card" key={outfit.scene}>
                    <div className="number">{String(index + 1).padStart(2, "0")}</div>
                    <p className="eyebrow">{outfit.scene}</p>
                    <h3>{outfit.title}</h3>
                    <p className="formula">{outfit.formula}</p>
                    <p>{outfit.reason}</p>
                    <div className="match-list">
                      {matched.map((item) => <span key={item.id}><i style={{ background: item.primaryColor.hex }} />{item.name}</span>)}
                      {!matched.length && <button type="button" onClick={() => onNavigate("wardrobe")}>衣橱暂无匹配单品，去添加 →</button>}
                    </div>
                    {outfit.missingPieces.length > 0 && <p className="missing"><strong>可补充：</strong>{outfit.missingPieces.join("、")}</p>}
                    <p className="alternative"><strong>替代：</strong>{outfit.alternative}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="reflection-section">
            <p className="eyebrow">REFLECTION</p><h2>留给自己的今日小问题</h2>
            <ol>{reading.profileNarrative.reflectionQuestions.map((question) => <li key={question}>{question}</li>)}</ol>
          </section>

          <details className="calculation-details">
            <summary><span><small>CALCULATION BASIS</small><strong>查看计算依据与文化说明</strong></span><b aria-hidden="true">+</b></summary>
            <div className="calculation-details-body">
              <section className="profile-reading" aria-labelledby="narrative-title">
                <div className="narrative-intro">
                  <p className="eyebrow">PROFILE NARRATIVE</p>
                  <h2 id="narrative-title">{reading.profileNarrative.title}</h2>
                  <p>{reading.profileNarrative.summary}</p>
                </div>
                <div className="element-notes">
                  {reading.profileNarrative.elementNotes.map((item) => {
                    const count = reading.birthChart.elements.find((element) => element.element === item.element);
                    return <div key={item.element}><b>{item.element}</b><span>{count?.count ?? 0} · {count?.band}</span><p>{item.note}</p></div>;
                  })}
                </div>
              </section>
              <BirthChartCard chart={reading.birthChart} compact />
            </div>
          </details>
          <p className="disclaimer">传统文化意象与生活方式灵感，仅供娱乐和审美参考；请勿将内容作为任何重要决定的依据。内容来源：{reading.provider} / {reading.model}，Prompt {reading.promptVersion}。</p>
        </>
      )}
    </div>
  );
}
