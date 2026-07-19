import type { BirthChart } from "@/lib/types";
import { getFortuneSlip } from "@/lib/fortune-slip";

const ELEMENT_CLASSES: Record<string, string> = {
  木: "element-wood",
  火: "element-fire",
  土: "element-earth",
  金: "element-metal",
  水: "element-water",
};

export function FortuneSlipCard({ chart, date }: { chart: BirthChart; date: string }) {
  const slip = getFortuneSlip(chart, date);
  const elementClass = ELEMENT_CLASSES[slip.element] ?? "";

  return (
    <article className={`fortune-slip-card ${elementClass}`} aria-label="今日日签">
      <div className="fortune-slip-inner">
        <p className="eyebrow">FORTUNE SLIP · {slip.element}元素</p>
        <h3 className="fortune-slip-title">{slip.title}</h3>
        <p className="fortune-slip-body">{slip.body}</p>
        <div className="fortune-slip-intention">
          <span className="intention-label">今日意向</span>
          <span>{slip.intention}</span>
        </div>
      </div>
    </article>
  );
}
