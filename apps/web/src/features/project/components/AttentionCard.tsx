import { Link } from "react-router-dom";
import type { ProjectSummaryDTO } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import type { Attention } from "@/features/project/lib/dashboard";

interface CardView {
  text: string;
  action: string;
  to: string;
  /** The dot's colour: the client's move, the photographer's, or just a reminder. */
  tone: "client" | "warm" | "quiet";
}

/** One thing waiting on the photographer, with the button that does it. */
export function AttentionCard({ project, item }: { project: ProjectSummaryDTO; item: Attention }) {
  const { t } = useLanguage();
  const view = cardView(item, `/projects/${project.id}`, t);
  return (
    <article className={`attention__card attention__card--${view.tone}`}>
      <span className="attention__mark" aria-hidden="true" />
      <div className="attention__text">
        <span className="attention__shoot">{project.name}</span>
        <span className="attention__detail">{view.text}</span>
      </div>
      <Link to={view.to} className="button button--small attention__action">
        {view.action}
      </Link>
    </article>
  );
}

function cardView(
  item: Attention,
  shootUrl: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): CardView {
  switch (item.kind) {
    case "changes":
      return {
        text: t("projects.attention.changes", { count: item.count }),
        action: t("projects.attention.review"),
        to: `/albums/${item.albumId}`,
        tone: "client",
      };
    case "picks":
      return {
        text: t("projects.attention.picks", { name: item.name, count: item.count }),
        action: t("projects.attention.generate"),
        to: `${shootUrl}?step=album`,
        tone: "warm",
      };
    case "deliver":
      return {
        text: t("projects.attention.deliver"),
        action: t("projects.attention.deliverAction"),
        to: `${shootUrl}?step=delivery`,
        tone: "warm",
      };
    case "expiring":
      return {
        text: t("projects.attention.expiring", { days: item.days }),
        action: t("projects.attention.open"),
        to: `${shootUrl}?step=delivery`,
        tone: "quiet",
      };
  }
}
