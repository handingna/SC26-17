"use client";

import { useEffect, useRef } from "react";

export function PrivacyDialog({
  open,
  consentMode,
  onAccept,
  onClose,
}: {
  open: boolean;
  consentMode: boolean;
  onAccept: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="privacy-dialog"
      aria-labelledby="privacy-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="privacy-dialog-copy">
        <p className="eyebrow">PRIVACY · V2</p>
        <h2 id="privacy-dialog-title">生成前的数据确认</h2>
        <p>出生日期和时间会发送到本应用服务端，用于按 Asia/Shanghai 确定性计算四柱；本应用不把精确生日和出生时间发送给第三方模型。</p>
        <p>第三方模型会收到派生四柱与五行计数、穿搭偏好，以及与所选场景相关的已启用衣橱信息。衣物名称和标签也会被发送，但只作为不可信数据处理。</p>
        <p>档案、衣橱和模型结果缓存在当前浏览器。合成演示完全在内存中运行，不调用 API、模型或浏览器存储。</p>
      </div>
      <div className="dialog-actions">
        {consentMode ? (
          <>
            <button className="outline" type="button" onClick={onClose}>返回修改</button>
            <button className="primary" type="button" onClick={onAccept}>继续生成</button>
          </>
        ) : (
          <button className="primary" type="button" onClick={onClose}>我知道了</button>
        )}
      </div>
    </dialog>
  );
}
