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
  { icon: "❤️", titleKey: "landing.feature.picks.title", descKey: "landing.feature.picks.desc" },
  { icon: "🧩", titleKey: "landing.feature.layouts.title", descKey: "landing.feature.layouts.desc" },
  { icon: "🖱️", titleKey: "landing.feature.dragdrop.title", descKey: "landing.feature.dragdrop.desc" },
  { icon: "📐", titleKey: "landing.feature.guides.title", descKey: "landing.feature.guides.desc" },
  { icon: "📏", titleKey: "landing.feature.sizes.title", descKey: "landing.feature.sizes.desc" },
  { icon: "💬", titleKey: "landing.feature.review.title", descKey: "landing.feature.review.desc" },
  { icon: "📦", titleKey: "landing.feature.delivery.title", descKey: "landing.feature.delivery.desc" },
  { icon: "🔑", titleKey: "landing.feature.links.title", descKey: "landing.feature.links.desc" },
  { icon: "✉️", titleKey: "landing.feature.alerts.title", descKey: "landing.feature.alerts.desc" },
  { icon: "📱", titleKey: "landing.feature.mobile.title", descKey: "landing.feature.mobile.desc" },
  { icon: "🌙", titleKey: "landing.feature.dark.title", descKey: "landing.feature.dark.desc" },
  { icon: "🌐", titleKey: "landing.feature.language.title", descKey: "landing.feature.language.desc" },
];

const STEPS: { titleKey: string; descKey: string }[] = [
  { titleKey: "landing.steps.upload.title", descKey: "landing.steps.upload.desc" },
  { titleKey: "landing.steps.pick.title", descKey: "landing.steps.pick.desc" },
  { titleKey: "landing.steps.design.title", descKey: "landing.steps.design.desc" },
  { titleKey: "landing.steps.approve.title", descKey: "landing.steps.approve.desc" },
  { titleKey: "landing.steps.deliver.title", descKey: "landing.steps.deliver.desc" },
];

/** Photo tiles under the hero, captioned with the feature each one illustrates. */
const SHOWCASE: { image: string; titleKey: string }[] = [
  { image: "/images/photographer-desk.webp", titleKey: "landing.feature.layouts.title" },
  { image: "/images/client-approval.webp", titleKey: "landing.feature.review.title" },
  { image: "/images/album-delivery.webp", titleKey: "landing.feature.delivery.title" },
];

/** The first thing a prospective photographer sees, before they've created an account. */
export function LandingPage() {
  const { t } = useLanguage();

  return (
    <div className="page landing">
      <section className="landing-hero">
        <div className="landing-hero__content">
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
        </div>
      </section>

      <div className="landing-showcase">
        {SHOWCASE.map((tile) => (
          <figure key={tile.titleKey} className="landing-showcase__tile">
            <img src={tile.image} alt="" loading="lazy" />
            <figcaption>{t(tile.titleKey)}</figcaption>
          </figure>
        ))}
      </div>

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
      <img src="/images/memory-card-to-album.webp" alt="" loading="lazy" className="landing-steps__banner" />
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
