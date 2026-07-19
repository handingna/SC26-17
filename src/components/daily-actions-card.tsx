import type { DailyActions } from "@/lib/types";

export function DailyActionsCard({ actions }: { actions: DailyActions }) {
  return (
    <article className="daily-actions-card" aria-label="今日行动建议">
      <div className="daily-actions-inner">
        <p className="eyebrow">DAILY ACTIONS</p>
        <h3>今日行动提示</h3>
        <div className="actions-columns">
          <div className="actions-do">
            <strong>可以做</strong>
            <ul>{actions.dos.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="actions-dont">
            <strong>可以减少</strong>
            <ul>{actions.donts.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
        <div className="micro-task">
          <span className="micro-task-label">今日一件小事</span>
          <span>{actions.microTask}</span>
        </div>
      </div>
    </article>
  );
}
