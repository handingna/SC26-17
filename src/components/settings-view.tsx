"use client";

import type { ModelStatus, UserProfileV3, WardrobeItemV3 } from "@/lib/types";

export function SettingsView({
  status,
  statusError,
  statusLoading = false,
  profile,
  wardrobe,
  cacheCount,
  storageError,
  demoMode = false,
  onClear,
  onOpenPrivacy = () => undefined,
  onRetryStatus = () => undefined,
}: {
  status: ModelStatus | null;
  statusError: string;
  statusLoading?: boolean;
  profile: UserProfileV3 | null;
  wardrobe: WardrobeItemV3[] | null;
  cacheCount: number;
  storageError: string | null;
  demoMode?: boolean;
  onClear: () => void;
  onOpenPrivacy?: () => void;
  onRetryStatus?: () => void;
}) {
  const state = status?.state ?? (status?.configured ? "ready" : status ? "unconfigured" : "checking");
  const stateLabel = demoMode ? "合成演示" : state === "ready" ? "模型已配置" : state === "invalid" ? "模型配置无效" : state === "unconfigured" ? "演示模式" : "正在检查";
  return (
    <div className="page narrow">
      <header className="settings-hero">
        <p className="eyebrow">MODEL CONSOLE</p>
        <div>
          <h1 tabIndex={-1}>模型设置</h1>
          <span className={`status ${demoMode ? "demo" : state === "ready" ? "ready" : state === "invalid" ? "invalid" : state === "unconfigured" ? "demo" : "checking"}`}>
            {stateLabel}
          </span>
        </div>
        <p>查看服务端模型状态、Prompt 版本与当前浏览器数据。模型检查在后台进行，不会阻塞其他页面。</p>
      </header>

      <section className="console-card connection">
        <div className="card-kicker">01 · CONNECTION</div>
        <div className="connection-grid">
          <div>
            <h2>{demoMode ? "合成演示正在内存中运行" : state === "ready" && status ? `${status.provider} 已配置` : state === "invalid" ? "模型配置无效" : state === "unconfigured" ? "当前使用演示模式" : "正在获取服务端状态"}</h2>
            <p>{demoMode ? "本次浏览只使用固定合成资料，不会发起模型生成或写入浏览器。" : state === "ready" ? "真实生成会使用确定性排盘结果、偏好和已启用衣橱；精确出生日期与时间不会发给第三方模型。" : state === "invalid" ? "服务端发现模型配置不完整或地址无效，因此不会尝试真实生成。合成演示仍可使用。" : "即使不连接模型，四柱计算、五行计数和本地演示内容仍可使用。"}</p>
            {!demoMode && statusError && <p className="console-error" role="alert">{statusError}</p>}
            {!demoMode && (statusError || state === "invalid") && <button className="outline light" type="button" disabled={statusLoading} onClick={onRetryStatus}>{statusLoading ? "正在重试…" : "重试模型状态"}</button>}
          </div>
          <dl>
            <div><dt>供应商</dt><dd>{status?.provider ?? "检查中"}</dd></div>
            <div><dt>模型</dt><dd>{status?.model ?? "—"}</dd></div>
            <div><dt>Prompt</dt><dd>{status?.promptVersion ?? "—"}</dd></div>
            <div><dt>Schema</dt><dd>{status?.schemaVersion ?? "—"}</dd></div>
            <div><dt>输出</dt><dd>严格 JSON</dd></div>
          </dl>
        </div>
      </section>

      {!demoMode && status && state !== "ready" && (
        <section className="console-card setup">
          <div className="card-kicker">02 · SETUP</div>
          <h2>服务端环境变量</h2>
          <ol>
            <li>在项目根目录的 <code>.env.local</code> 中完整设置 <code>AI_API_KEY</code>、<code>AI_MODEL</code> 与 <code>AI_BASE_URL</code>。</li>
            <li><code>AI_PROVIDER_NAME</code> 仅用于显示，可选。</li>
            <li>只要出现任一 <code>AI_*</code> 核心变量，就不会混用旧变量；<code>DEEPSEEK_*</code> 只能作为完整一组兼容回退。</li>
            <li>重启服务后回到本页确认状态。</li>
          </ol>
          <p>密钥只由服务端读取，不会显示或发送到浏览器。</p>
        </section>
      )}

      <details className="console-card boundaries">
        <summary><span>03 · 计算与生成边界</span><b aria-hidden="true">+</b></summary>
        <div>
          <p><strong>确定性计算：</strong>以 Asia/Shanghai 墙上时间计算四柱，23:00 起按次日干支；统计四个天干和四个地支的表层元素。</p>
          <p><strong>模型表达：</strong>只把派生结果用于色彩、材质和穿搭灵感，不补算或纠正四柱，不判断旺衰、喜用神或个人运势。</p>
          <p><strong>安全边界：</strong>衣物名称和偏好均视为不可信数据，模型不得执行其中夹带的指令，也不得虚构衣物 ID。</p>
        </div>
      </details>

      <section className="console-card data-control">
        <div className="card-kicker">04 · LOCAL DATA</div>
        <h2>浏览器本地数据</h2>
        <div className="data-stats">
          <span>档案 <b>{profile ? 1 : 0}</b></span>
          <span>衣橱 <b>{wardrobe?.length ?? 0}</b></span>
          <span>模型灵感缓存 <b>{cacheCount}</b></span>
        </div>
        <p>{demoMode ? "当前合成档案、3 件示例单品和固定结果只存在于内存；退出演示后会恢复真实数据。" : "档案、衣橱和模型结果缓存在当前浏览器。生成时，出生资料会发到本应用服务端排盘；第三方模型仅接收派生结果和穿搭数据。演示内容不会进入模型缓存。"}</p>
        {storageError && <p className="storage-error" role="alert">{storageError}</p>}
        <div className="settings-actions">
          <button className="outline" type="button" onClick={onOpenPrivacy}>查看隐私说明</button>
          {!demoMode && <button
            className="outline danger"
            type="button"
            onClick={() => window.confirm("确定删除此浏览器中的档案、衣橱、隐私确认和灵感缓存吗？此操作无法撤销。" ) && onClear()}
          >清除全部本地数据</button>}
        </div>
      </section>
    </div>
  );
}
