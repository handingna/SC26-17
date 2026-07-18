"use client";

import { FormEvent, useState } from "react";
import type { Category, Scene, Season, WardrobeItemV3 } from "@/lib/types";
import { CATEGORIES, SCENES, SEASONS } from "@/lib/types";
import { wardrobeV3Schema } from "@/lib/schemas";
import { SAMPLE_WARDROBE as FIXED_SAMPLE_WARDROBE } from "./demo-data";
import type { AppSection } from "./app-nav";

export const SAMPLE_WARDROBE = FIXED_SAMPLE_WARDROBE;

const EMPTY_FORM = {
  name: "",
  category: "上装" as Category,
  colorName: "玉白",
  colorHex: "#F5F2E8",
  scenes: ["通勤"] as Scene[],
  seasons: ["四季"] as Season[],
  tags: "",
};

type WardrobeForm = typeof EMPTY_FORM;

export function WardrobeView({
  items,
  readOnly = false,
  onNavigate = () => undefined,
  onSkipWardrobe = () => undefined,
  onChange,
}: {
  items: WardrobeItemV3[] | null;
  readOnly?: boolean;
  onNavigate?: (section: AppSection) => void;
  onSkipWardrobe?: () => void;
  onChange: (items: WardrobeItemV3[]) => boolean;
}) {
  const [form, setForm] = useState<WardrobeForm>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const wardrobe = items ?? [];

  const persist = (next: WardrobeItemV3[], successMessage = "") => {
    const validated = wardrobeV3Schema.safeParse(next);
    if (!validated.success) {
      setMessage(validated.error.issues[0]?.message ?? "衣橱内容格式不正确。");
      setSaved(false);
      return false;
    }
    const saved = onChange(validated.data as WardrobeItemV3[]);
    setMessage(saved ? successMessage : "浏览器未能保存衣橱，请检查存储权限或剩余空间。");
    setSaved(saved && next.length > 0);
    return saved;
  };

  const toggleFormValue = (key: "scenes" | "seasons", value: Scene | Season) => {
    const current = form[key] as string[];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setForm({ ...form, [key]: next } as WardrobeForm);
  };

  const closeEditor = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormOpen(false);
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormOpen(true);
    setMessage("");
  };

  const openEdit = (item: WardrobeItemV3) => {
    setForm({
      name: item.name,
      category: item.category,
      colorName: item.primaryColor.name,
      colorHex: item.primaryColor.hex,
      scenes: [...item.scenes],
      seasons: [...item.seasons],
      tags: item.tags.join("、"),
    });
    setEditingId(item.id);
    setFormOpen(true);
    setMessage("");
    queueMicrotask(() => document.querySelector<HTMLElement>("#wardrobe-editor-title")?.focus());
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.colorName.trim() || !form.scenes.length || !form.seasons.length) {
      setMessage("请填写衣物名称和颜色，并至少选择一个场景与季节。");
      return;
    }
    if (!editingId && wardrobe.length >= 60) {
      setMessage("衣橱最多保存 60 件单品。");
      return;
    }
    const previous = editingId ? wardrobe.find((item) => item.id === editingId) : null;
    const item: WardrobeItemV3 = {
      ...(previous ?? {}),
      id: previous?.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      category: form.category,
      primaryColor: { name: form.colorName.trim(), hex: form.colorHex.toUpperCase() },
      scenes: form.scenes,
      seasons: form.seasons,
      tags: [...new Set(form.tags.split(/[，,、]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 8),
      enabled: previous?.enabled ?? true,
    };
    const next = editingId
      ? wardrobe.map((candidate) => candidate.id === editingId ? item : candidate)
      : [item, ...wardrobe];
    if (persist(next, editingId ? "修改已保存。" : "单品已加入衣橱。")) closeEditor();
  };

  const useSamples = () => {
    const existingIds = new Set(wardrobe.map((item) => item.id));
    const samples = SAMPLE_WARDROBE.filter((item) => !existingIds.has(item.id));
    persist([...samples, ...wardrobe].slice(0, 60), "3 件夏季示例单品已加入；你可以继续编辑。" );
  };

  return (
    <div className="page wardrobe-page">
      <header className="page-header wardrobe-heading">
        <div>
          <p className="eyebrow">PERSONAL WARDROBE</p>
          <h1 tabIndex={-1}>{readOnly ? "合成衣橱" : "我的衣橱"}</h1>
          <p>{readOnly ? "以下 3 件夏季单品只存在于本次内存演示，退出后会恢复你的真实衣橱。" : "只有已启用、匹配场景与当前季节的单品会参与生成，结果会直接引用真实衣物 ID。"}</p>
        </div>
        {!readOnly && wardrobe.length > 0 && (
          <div className="wardrobe-actions">
            <button className="outline" type="button" onClick={openNew}>添加单品</button>
            <button
              className="text-danger"
              type="button"
              onClick={() => window.confirm("确定清空当前衣橱吗？此操作无法撤销。") && persist([], "衣橱已清空。")}
            >清空衣橱</button>
          </div>
        )}
      </header>

      {!readOnly && wardrobe.length === 0 && (
        <section className="empty-state wardrobe-empty" aria-label="衣橱目前为空">
          <span>02</span><h2>{items === null ? "从示例或自己的单品开始" : "衣橱目前是空的"}</h2>
          <p>示例不会自动加入。也可以保持空衣橱直接生成，所缺单品会明确列为建议。</p>
          <div className="empty-actions">
            <button className="primary" type="button" onClick={useSamples}>使用 3 件示例单品</button>
            <button className="outline" type="button" onClick={openNew}>手动添加第一件</button>
            <button className="text-button neutral" type="button" onClick={onSkipWardrobe}>跳过衣橱，去生成</button>
          </div>
        </section>
      )}

      {!readOnly && formOpen && (
        <form className="item-form" onSubmit={submit}>
          <div className="form-title-row">
            <h2 id="wardrobe-editor-title" tabIndex={-1}>{editingId ? "编辑单品" : "添加单品"}</h2>
            <button className="text-button neutral" type="button" onClick={closeEditor}>取消编辑</button>
          </div>
          <div className="item-form-grid">
            <label htmlFor="item-name">衣物名称 <b aria-hidden="true">*</b>
              <input id="item-name" required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：玉白亚麻短袖衬衫" />
            </label>
            <label htmlFor="item-category">类别
              <select id="item-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as Category })}>
                {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label htmlFor="color-name">主色名称 <b aria-hidden="true">*</b>
              <input id="color-name" required maxLength={30} value={form.colorName} onChange={(event) => setForm({ ...form, colorName: event.target.value })} />
            </label>
            <label htmlFor="color-hex">主色 HEX
              <span className="color-input"><input id="color-hex" type="color" value={form.colorHex} onChange={(event) => setForm({ ...form, colorHex: event.target.value })} /><code>{form.colorHex.toUpperCase()}</code></span>
            </label>
          </div>
          <fieldset>
            <legend>适用场景 <b aria-hidden="true">*</b></legend>
            <div className="choice-grid compact-choices">
              {SCENES.map((scene) => <label className="choice" key={scene}><input type="checkbox" checked={form.scenes.includes(scene)} onChange={() => toggleFormValue("scenes", scene)} /><span>{scene}</span></label>)}
            </div>
          </fieldset>
          <fieldset>
            <legend>适用季节 <b aria-hidden="true">*</b></legend>
            <div className="choice-grid compact-choices seasons">
              {SEASONS.map((season) => <label className="choice" key={season}><input type="checkbox" checked={form.seasons.includes(season)} onChange={() => toggleFormValue("seasons", season)} /><span>{season}</span></label>)}
            </div>
          </fieldset>
          <label htmlFor="item-tags">标签（可选）
            <input id="item-tags" maxLength={180} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="例如：亚麻、宽松、极简" />
          </label>
          <div className="form-submit-row">
            <button className="primary" type="submit">{editingId ? "保存修改" : "添加单品"}</button>
            {editingId && <button className="outline" type="button" onClick={closeEditor}>取消编辑</button>}
          </div>
        </form>
      )}

      <p className="form-message" aria-live="polite">{message}</p>
      {!readOnly && saved && wardrobe.length > 0 && (
        <div className="wardrobe-next"><span>衣橱已准备好，可以生成包含真实单品 ID 的结果。</span><button className="primary" type="button" onClick={() => onNavigate("today")}>生成今日灵感</button></div>
      )}

      <div className="wardrobe-grid">
        {wardrobe.map((item) => (
          <article className={`wardrobe-card${item.enabled ? "" : " disabled"}`} key={item.id}>
            <div className="cloth-shape" aria-hidden="true"><i style={{ background: item.primaryColor.hex }} /></div>
            <div className="wardrobe-copy">
              <p className="eyebrow">{item.category} · {item.scenes.join(" / ")}</p>
              <h3>{item.name}</h3>
              <span className="item-color"><i style={{ background: item.primaryColor.hex }} />{item.primaryColor.name} <code>{item.primaryColor.hex}</code></span>
              <small>{item.seasons.join(" · ")}{item.tags.length ? ` · ${item.tags.join(" · ")}` : ""}</small>
            </div>
            {!readOnly && (
              <div className="card-actions">
                <label className="switch"><input aria-label={`启用 ${item.name}`} type="checkbox" checked={item.enabled} onChange={() => persist(wardrobe.map((candidate) => candidate.id === item.id ? { ...candidate, enabled: !candidate.enabled } : candidate))} /><span>启用</span></label>
                <div>
                  <button aria-label={`编辑 ${item.name}`} className="edit" type="button" onClick={() => openEdit(item)}>编辑</button>
                  <button aria-label={`移除 ${item.name}`} className="delete" type="button" onClick={() => persist(wardrobe.filter((candidate) => candidate.id !== item.id), "单品已移除。")}>移除</button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
