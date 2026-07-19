"use client";

import { FormEvent, useState } from "react";
import type { ApiErrorBody, BirthChart, UserProfileV3 } from "@/lib/types";
import { SCENES } from "@/lib/types";
import { localDateKey } from "@/lib/cache-key";
import { userProfileV3Schema } from "@/lib/schemas";
import { birthChartStorageSchema } from "@/lib/storage";
import { BirthChartCard } from "./birth-chart-card";
import type { AppSection } from "./app-nav";

const STYLE_OPTIONS = ["自然简约", "经典通勤", "轻松休闲", "柔和浪漫", "利落中性", "东方雅致"];

const EMPTY_PROFILE: UserProfileV3 = {
  birthDate: "",
  birthTime: "",
  scenes: ["通勤"],
  styles: ["自然简约"],
  favoriteColors: [],
  avoidColors: [],
};

function splitValues(value: string) {
  return [...new Set(value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean))].slice(0, 12);
}

export function ProfileView({
  profile,
  chart,
  demoMode = false,
  onNavigate,
  onSkipWardrobe,
  onSaved,
}: {
  profile: UserProfileV3 | null;
  chart: BirthChart | null;
  demoMode?: boolean;
  onNavigate: (section: AppSection) => void;
  onSkipWardrobe: () => void;
  onSaved: (profile: UserProfileV3, chart: BirthChart) => boolean;
}) {
  const [form, setForm] = useState<UserProfileV3>(profile ?? EMPTY_PROFILE);
  const [favoriteInput, setFavoriteInput] = useState((profile?.favoriteColors ?? []).join("、"));
  const [avoidInput, setAvoidInput] = useState((profile?.avoidColors ?? []).join("、"));
  const [previewChart, setPreviewChart] = useState<BirthChart | null>(chart);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"birthDate" | "birthTime" | "scenes" | "styles", string>>>({});

  const focusFirstInvalid = (errors: typeof fieldErrors) => {
    const target = errors.birthDate ? "#birth-date"
      : errors.birthTime ? "#birth-time"
        : errors.scenes ? 'input[name="profile-scenes"]'
          : errors.styles ? 'input[name="profile-styles"]'
            : null;
    if (target) requestAnimationFrame(() => document.querySelector<HTMLElement>(target)?.focus());
  };

  const toggle = (key: "scenes" | "styles", value: string) => {
    const current = form[key] as string[];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setForm({ ...form, [key]: next });
    setFieldErrors((currentErrors) => ({ ...currentErrors, [key]: undefined }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const candidate = { ...form, favoriteColors: splitValues(favoriteInput), avoidColors: splitValues(avoidInput) };
    const requiredErrors = {
      ...(!candidate.birthDate ? { birthDate: "请选择公历出生日期。" } : {}),
      ...(!candidate.birthTime ? { birthTime: "请选择出生时间。" } : {}),
      ...(!candidate.scenes.length ? { scenes: "请至少选择一个常用场景。" } : {}),
      ...(!candidate.styles.length ? { styles: "请至少选择一种喜欢的风格。" } : {}),
    };
    if (Object.keys(requiredErrors).length > 0) {
      setFieldErrors(requiredErrors);
      setMessage({ type: "error", text: "请填写出生日期和时间，并至少选择一个常用场景与一种风格。" });
      focusFirstInvalid(requiredErrors);
      return;
    }
    const favorites = new Set(candidate.favoriteColors.map((color) => color.toLocaleLowerCase("zh-CN")));
    if (candidate.avoidColors.some((color) => favorites.has(color.toLocaleLowerCase("zh-CN")))) {
      setMessage({ type: "error", text: "喜欢的颜色和希望少用的颜色不能重复。" });
      return;
    }
    const validatedProfile = userProfileV3Schema.safeParse(candidate);
    if (!validatedProfile.success) {
      const errors = validatedProfile.error.issues.reduce<typeof fieldErrors>((result, issue) => {
        const field = issue.path[0];
        if (field === "birthDate" || field === "birthTime" || field === "scenes" || field === "styles") result[field] ??= issue.message;
        return result;
      }, {});
      setFieldErrors(errors);
      setMessage({ type: "error", text: validatedProfile.error.issues[0]?.message ?? "档案内容格式不正确。" });
      focusFirstInvalid(errors);
      return;
    }
    const nextProfile = validatedProfile.data as UserProfileV3;
    setSaving(true);
    setFieldErrors({});
    setMessage(null);
    try {
      const response = await fetch("/api/birth-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate: nextProfile.birthDate, birthTime: nextProfile.birthTime }),
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        const error = body as Partial<ApiErrorBody> | null;
        throw new Error(error?.error?.message ?? "暂时无法完成排盘，请检查日期和时间。" );
      }
      const parsed = birthChartStorageSchema.safeParse(body);
      if (!parsed.success) throw new Error("排盘结果格式异常，请重试。" );
      const nextChart = parsed.data as BirthChart;
      setPreviewChart(nextChart);
      const persisted = onSaved(nextProfile, nextChart);
      setForm(nextProfile);
      setMessage({
        type: persisted ? "success" : "error",
        text: persisted ? "档案已保存，四柱与表层五行已更新。" : "排盘已完成，但浏览器未能保存档案，请检查存储权限。",
      });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "暂时无法保存档案。" });
    } finally {
      setSaving(false);
    }
  };

  if (demoMode) {
    return (
      <div className="page narrow">
        <header className="page-header">
          <p className="eyebrow">SYNTHETIC PROFILE</p>
          <h1 tabIndex={-1}>合成档案</h1>
          <p>这是固定的课程演示档案，不对应真实人物，也不会写入浏览器。退出演示后，你原来的档案会原样恢复。</p>
        </header>
        <section className="demo-profile-card" aria-label="合成档案摘要">
          <div><span>公历时间</span><strong>{profile?.birthDate} · {profile?.birthTime}</strong></div>
          <div><span>常用场景</span><strong>{profile?.scenes.join(" / ")}</strong></div>
          <div><span>风格方向</span><strong>{profile?.styles.join(" / ")}</strong></div>
        </section>
        {chart && <BirthChartCard chart={chart} />}
      </div>
    );
  }

  return (
    <div className="page narrow">
      <header className="page-header">
        <p className="eyebrow">PERSONAL REFERENCE</p>
        <h1 tabIndex={-1}>个人档案</h1>
        <p>用公历出生日期与时间确定性计算四柱；五行只作为透明的色彩审美权重，不用于预测或重要决定。</p>
      </header>
      {profile && !profile.birthTime && (
        <div className="notice warning" role="status">旧版档案缺少出生时间，请补全后重新保存，才能生成今日灵感。</div>
      )}
      <form className="profile-form" onSubmit={save} noValidate>
        <div className="form-two">
          <label htmlFor="birth-date">公历出生日期 <b aria-hidden="true">*</b>
            <input
              id="birth-date"
              required
              type="date"
              min="1900-01-01"
              max={localDateKey()}
              value={form.birthDate}
              aria-invalid={Boolean(fieldErrors.birthDate)}
              aria-describedby={fieldErrors.birthDate ? "birth-date-error" : undefined}
              onChange={(event) => {
                setForm({ ...form, birthDate: event.target.value });
                setFieldErrors((errors) => ({ ...errors, birthDate: undefined }));
              }}
            />
            {fieldErrors.birthDate && <span className="field-error" id="birth-date-error">{fieldErrors.birthDate}</span>}
          </label>
          <label htmlFor="birth-time">出生时间 <b aria-hidden="true">*</b>
            <input
              id="birth-time"
              required
              type="time"
              value={form.birthTime}
              aria-invalid={Boolean(fieldErrors.birthTime)}
              aria-describedby={fieldErrors.birthTime ? "birth-time-error" : undefined}
              onChange={(event) => {
                setForm({ ...form, birthTime: event.target.value });
                setFieldErrors((errors) => ({ ...errors, birthTime: undefined }));
              }}
            />
            {fieldErrors.birthTime && <span className="field-error" id="birth-time-error">{fieldErrors.birthTime}</span>}
          </label>
        </div>

        <fieldset aria-describedby={fieldErrors.scenes ? "profile-scenes-error" : undefined}>
          <legend>常用场景 <b aria-hidden="true">*</b></legend>
          <div className="choice-grid">
            {SCENES.map((scene) => (
              <label className="choice" key={scene}>
                <input name="profile-scenes" type="checkbox" checked={form.scenes.includes(scene)} aria-invalid={Boolean(fieldErrors.scenes)} onChange={() => toggle("scenes", scene)} />
                <span>{scene}</span>
              </label>
            ))}
          </div>
          {fieldErrors.scenes && <p className="field-error" id="profile-scenes-error">{fieldErrors.scenes}</p>}
        </fieldset>

        <fieldset aria-describedby={fieldErrors.styles ? "profile-styles-error" : undefined}>
          <legend>喜欢的风格 <b aria-hidden="true">*</b></legend>
          <div className="choice-grid styles">
            {STYLE_OPTIONS.map((style) => (
              <label className="choice" key={style}>
                <input name="profile-styles" type="checkbox" checked={form.styles.includes(style)} aria-invalid={Boolean(fieldErrors.styles)} onChange={() => toggle("styles", style)} />
                <span>{style}</span>
              </label>
            ))}
          </div>
          {fieldErrors.styles && <p className="field-error" id="profile-styles-error">{fieldErrors.styles}</p>}
        </fieldset>

        <div className="form-two">
          <label htmlFor="favorite-colors">喜欢的颜色（可选）
            <input
              id="favorite-colors"
              value={favoriteInput}
              placeholder="例如：苔藓绿、玉白"
              onChange={(event) => setFavoriteInput(event.target.value)}
            />
          </label>
          <label htmlFor="avoid-colors">希望少用的颜色（可选）
            <input
              id="avoid-colors"
              value={avoidInput}
              placeholder="例如：荧光粉、正红"
              onChange={(event) => setAvoidInput(event.target.value)}
            />
          </label>
        </div>

        <div className="privacy-inline">
          <strong>数据如何流转</strong>
          <p>保存时，日期和时间会发送到本应用服务端完成排盘。真实生成时，第三方模型只接收派生四柱、五行计数、偏好与已启用衣橱，不接收精确生日和时间。</p>
        </div>
        <button className="primary" type="submit" disabled={saving}>{saving ? "正在计算…" : "保存并计算四柱"}</button>
        <div className="form-message" aria-live="polite">
          {message && <p className={message.type}>{message.text}</p>}
        </div>
      </form>
      {(previewChart ?? chart) && <BirthChartCard chart={(previewChart ?? chart)!} />}
      {message?.type === "success" && (
        <section className="next-step-card" aria-label="档案保存后的下一步">
          <div><p className="eyebrow">PROFILE READY</p><h2>档案已经准备好</h2><p>可以先准备衣橱，让结果引用真实单品；也可以空衣橱直接生成。</p></div>
          <div className="next-step-actions">
            <button className="next-step-primary" type="button" onClick={() => onNavigate("wardrobe")}>下一步：准备衣橱 <span aria-hidden="true">→</span></button>
            <button className="next-step-secondary" type="button" onClick={onSkipWardrobe}>跳过衣橱，去生成</button>
          </div>
        </section>
      )}
    </div>
  );
}
