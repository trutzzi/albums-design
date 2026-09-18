import { Link } from "react-router-dom";
import { useLanguage } from "../../lib/i18n/LanguageContext";

interface Feature {
  icon: string;
  titleKey: string;
  descKey: string;
}

const FEATURES: Feature[] = [
  { icon: "🧠", titleKey: "landing.feature.scoring.title", descKey: "landing.feature.scoring.desc" },
  { icon: "🔒", titleKey: "landing.feature.aiOptIn.title", descKey: "landing.feature.aiOptIn.desc" },
  { icon: "🧩", titleKey: "landing.feature.layouts.title", descKey: "landing.feature.layouts.desc" },
  { icon: "🖱️", titleKey: "landing.feature.dragdrop.title", descKey: "landing.feature.dragdrop.desc" },
  { icon: "📐", titleKey: "landing.feature.guides.title", descKey: "landing.feature.guides.desc" },
  { icon: "📏", titleKey: "landing.feature.sizes.title", descKey: "landing.feature.sizes.desc" },
  { icon: "💬", titleKey: "landing.feature.review.title", descKey: "landing.feature.review.desc" },
  { icon: "🌐", titleKey: "landing.feature.language.title", descKey: "landing.feature.language.desc" },
];

const STEPS: { titleKey: string; descKey: string }[] = [
  { titleKey: "landing.steps.upload.title", descKey: "landing.steps.upload.desc" },
  { titleKey: "landing.steps.design.title", descKey: "landing.steps.design.desc" },
  { titleKey: "landing.steps.approve.title", descKey: "landing.steps.approve.desc" },
];

/** The first thing a prospective photographer sees, before they've created an account. */
export function LandingPage() {
  const { t } = useLanguage();

  return (
    <div className="page landing">
      <section className="landing-hero">
        <span className="landing-hero__kicker">{t("landing.kicker")}</span>
        <h1 className="landing-hero__title">{t("landing.hero.title")}</h1>
        <p className="landing-hero__subtitle">{t("landing.hero.subtitle")}</p>
        <div className="landing-hero__actions">
          <Link to="/register" className="button button--primary">
            {t("landing.hero.cta.primary")}
          </Link>
          <Link to="/login" className="button">
            {t("landing.hero.cta.secondary")}
          </Link>
        </div>
      </section>

      <h2 className="landing-section-heading">{t("landing.features.heading")}</h2>
      <p className="landing-section-subheading">{t("landing.features.subheading")}</p>
      <div className="landing-features">
        {FEATURES.map((feature) => (
          <article key={feature.titleKey} className="landing-feature">
            <span className="landing-feature__icon" aria-hidden="true">
              {feature.icon}
            </span>
            <h3>{t(feature.titleKey)}</h3>
            <p>{t(feature.descKey)}</p>
          </article>
        ))}
      </div>

      <h2 className="landing-section-heading">{t("landing.steps.heading")}</h2>
      <div className="landing-steps">
        {STEPS.map((step, index) => (
          <div key={step.titleKey} className="landing-step">
            <span className="landing-step__number">{index + 1}</span>
            <h3>{t(step.titleKey)}</h3>
            <p>{t(step.descKey)}</p>
          </div>
        ))}
      </div>

      <section className="landing-cta">
        <h2>{t("landing.cta.heading")}</h2>
        <p>{t("landing.cta.subtitle")}</p>
        <Link to="/register" className="button button--primary">
          {t("landing.cta.button")}
        </Link>
      </section>
    </div>
  );
}
