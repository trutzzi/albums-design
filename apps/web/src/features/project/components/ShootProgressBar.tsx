import type { ProjectSummaryDTO } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { stepsDone, workflowOf } from "@/features/project/lib/dashboard";

/** Four segments, one per step of the shoot, and the next thing to do — the shoot page's own words. */
export function ShootProgressBar({ project }: { project: ProjectSummaryDTO }) {
  const { t } = useLanguage();
  const done = stepsDone(project);
  const next = workflowOf(project).next.text;
  return (
    <div className="shoot-card__progress">
      <div
        className="shoot-card__steps"
        role="img"
        aria-label={t("projects.card.progress", { done: done.filter(Boolean).length, total: done.length })}
      >
        {done.map((isDone, index) => (
          <span key={index} className={isDone ? "shoot-card__step shoot-card__step--done" : "shoot-card__step"} />
        ))}
      </div>
      <p className="shoot-card__next">{t(next.key, next.params)}</p>
    </div>
  );
}
