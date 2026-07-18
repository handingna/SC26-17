import type { BirthChart } from "@/lib/types";

const PILLAR_LABELS = [
  ["year", "年柱"],
  ["month", "月柱"],
  ["day", "日柱"],
  ["hour", "时柱"],
] as const;

export function BirthChartCard({ chart, compact = false }: { chart: BirthChart; compact?: boolean }) {
  return (
    <section className={`birth-chart${compact ? " compact" : ""}`} aria-labelledby="birth-chart-title">
      <div className="birth-chart-heading">
        <div>
          <p className="eyebrow">VISIBLE ELEMENTS</p>
          <h2 id="birth-chart-title">四柱与表层五行</h2>
        </div>
        <span>共 8 个表层字</span>
      </div>
      <div className="pillars" role="list" aria-label="四柱">
        {PILLAR_LABELS.map(([key, label]) => {
          const pillar = chart.pillars[key];
          return (
            <div className="pillar" role="listitem" key={key}>
              <span>{label}</span>
              <strong>{pillar.stem}{pillar.branch}</strong>
              <small>{pillar.stemElement} · {pillar.branchElement}</small>
            </div>
          );
        })}
      </div>
      <div className="element-counts" aria-label="五行表层计数">
        {chart.elements.map((item) => (
          <div key={item.element}>
            <span>{item.element}</span>
            <b>{item.count}</b>
            <em>{item.band}</em>
            <i aria-hidden="true"><span style={{ width: `${Math.max(8, item.count * 12.5)}%` }} /></i>
          </div>
        ))}
      </div>
      <p className="chart-method">
        采用中国标准时间（Asia/Shanghai）；23:00 起按次日干支计算。这里只统计四柱天干、地支的表层元素，不含藏干、旺衰、喜用神或真太阳时。
      </p>
    </section>
  );
}
