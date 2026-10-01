import { Link } from "react-router-dom";
import type { ProjectSummaryDTO } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";

const DISMISSED_KEY = "albumflow.onboarding.dismissed";

export function onboardingDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The first-shoot checklist on the shoots page. Every step is read from real data,
 * so it ticks itself off as the photographer works and disappears once the first
 * album exists — nothing to remember to update, nothing that can drift.
 */
export function GettingStarted({
  projects,
  dismissed,
  onDismiss,
  onCreateShoot,
}: {
  projects: ProjectSummaryDTO[];
  dismissed: boolean;
  onDismiss: () => void;
  onCreateShoot: () => void;
}) {
  const { t } = useLanguage();

  const withPhotos = projects.find((project) => project.photoCount > 0);
  const withAlbum = projects.find((project) => project.albumCount > 0);
  const first = projects[0];
  if (dismissed || withAlbum) return null;

  const steps = [
    {
      key: "shoot",
      done: projects.length > 0,
      action: <button type="button" className="button button--small button--primary" onClick={onCreateShoot}>{t("onboarding.shoot.cta")}</button>,
    },
    {
      key: "upload",
      done: Boolean(withPhotos),
      action: first ? <Link className="button button--small button--primary" to={`/projects/${first.id}`}>{t("onboarding.upload.cta")}</Link> : null,
    },
    {
      key: "album",
      done: false,
      action: withPhotos ? <Link className="button button--small button--primary" to={`/projects/${withPhotos.id}`}>{t("onboarding.album.cta")}</Link> : null,
    },
  ];
  const next = steps.find((step) => !step.done)?.key;

  return (
    <section className="panel getting-started" data-tour="getting-started">
      <div className="panel__head">
        <div>
          <h2>{t("onboarding.title")}</h2>
          <p className="muted">{t("onboarding.subtitle")}</p>
        </div>
        <button
          type="button"
          className="button button--small"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISSED_KEY, "1");
            } catch {
              // Private mode: it simply shows again next visit.
            }
            onDismiss();
          }}
        >
          {t("onboarding.dismiss")}
        </button>
      </div>
      <ol className="getting-started__steps">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`getting-started__step ${step.done ? "is-done" : ""} ${step.key === next ? "is-next" : ""}`}
          >
            <span className="getting-started__marker" aria-hidden="true">
              {step.done ? "✓" : index + 1}
            </span>
            <div>
              <strong>{t(`onboarding.${step.key}.title`)}</strong>
              <p className="muted">{t(`onboarding.${step.key}.body`)}</p>
            </div>
            {step.key === next && step.action}
          </li>
        ))}
      </ol>
    </section>
  );
}
