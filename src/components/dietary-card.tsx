import type { DietarySection } from "@/lib/types";

export function DietaryCard({ dietary }: { dietary: DietarySection }) {
  return (
    <article className="dietary-card" aria-label="今日饮食参考">
      <div className="dietary-inner">
        <p className="eyebrow">DIETARY NOTE</p>
        <h3>今日饮食参考</h3>
        <div className="dietary-tips">
          {dietary.tips.map((tip) => (
            <div className="dietary-tip" key={tip.category}>
              <span className="tip-category">{tip.category}</span>
              <div>
                <strong>{tip.suggestion}</strong>
                <p>{tip.reason}</p>
              </div>
            </div>
          ))}
        </div>
        {dietary.avoidNote && (
          <p className="dietary-avoid"><strong>适度减少：</strong>{dietary.avoidNote}</p>
        )}
        <p className="dietary-disclaimer">饮食建议来自文化审美与时令参考，不构成营养或健康建议。</p>
      </div>
    </article>
  );
}
