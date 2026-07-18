"use client";

export type AppSection = "today" | "wardrobe" | "profile" | "settings";

const ITEMS: Array<{ id: AppSection; label: string }> = [
  { id: "today", label: "今日灵感" },
  { id: "profile", label: "个人档案" },
  { id: "wardrobe", label: "我的衣橱" },
  { id: "settings", label: "模型设置" },
];

export function AppNav({
  active,
  demoMode,
  onChange,
  onOpenPrivacy,
  onStartDemo,
}: {
  active: AppSection;
  demoMode: boolean;
  onChange: (section: AppSection) => void;
  onOpenPrivacy: () => void;
  onStartDemo: () => void;
}) {
  const links = (className: string) => (
    <div className={className}>
      {ITEMS.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={active === item.id ? "active" : ""}
          aria-current={active === item.id ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            onChange(item.id);
          }}
        >
          {item.label}
        </a>
      ))}
    </div>
  );

  return (
    <>
      <nav className="nav" aria-label="主要导航">
        <a
          className="brand"
          href="#today"
          onClick={(event) => {
            event.preventDefault();
            onChange("today");
          }}
          aria-label="五行日常，返回今日灵感"
        >
          五行<span>·</span>日常
        </a>
        {links("nav-links")}
        <div className="nav-utility">
          {!demoMode && <button type="button" onClick={onStartDemo}>快速体验合成示例</button>}
          <button type="button" onClick={onOpenPrivacy}>隐私说明</button>
        </div>
      </nav>
      <nav className="mobile-nav" aria-label="移动端主要导航">
        {links("mobile-nav-links")}
      </nav>
    </>
  );
}
