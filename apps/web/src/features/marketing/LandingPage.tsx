import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listPlans } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { hasLaunchDiscount, isRecommended, isTrial, planHighlights } from "@/features/marketing/lib/pricing";
import { localeOf } from "@/shared/i18n/locale";
import { SkeletonText } from "@/shared/ui/Loading";

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

      <Pricing />

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

/** The plans with their real prices, from the same list the studio page reads. */
function Pricing() {
  const { t, language } = useLanguage();
  const plans = useQuery({ queryKey: ["plans"], queryFn: listPlans, staleTime: Infinity });
  const launchEnds = plans.data?.[0]?.launchPricesUntil;
  // The launch offer is only promised while it is still open.
  const offerOpen = launchEnds ? new Date(launchEnds).getTime() > Date.now() : false;
  return (
    <section className="landing-pricing" id="pricing" aria-labelledby="pricing-title">
      <h2 id="pricing-title" className="landing-section-heading">
        {t("landing.pricing.heading")}
      </h2>
      {offerOpen && launchEnds && (
        <p className="landing-section-subheading">
          {t("landing.pricing.launch", {
            date: new Date(launchEnds).toLocaleDateString(localeOf(language), {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          })}
        </p>
      )}
      {plans.isLoading && <SkeletonText lines={3} label={t("landing.pricing.loading")} />}
      {plans.isError && (
        <p className="muted">
          {t("landing.pricing.error")} <Link to="/contact">{t("landing.pricing.contact")}</Link>
        </p>
      )}
      <div className="landing-pricing__plans">
        {(plans.data ?? []).map((plan) => (
          <article
            key={plan.code}
            className={`landing-plan ${isRecommended(plan) ? "landing-plan--recommended" : ""}`}
            aria-label={plan.name}
          >
            <div className="landing-plan__head">
              <h3>{plan.name}</h3>
              {isRecommended(plan) && <span className="landing-plan__badge">{t("landing.pricing.recommended")}</span>}
            </div>
            <p className="landing-plan__price">
              <span className="landing-plan__amount">€{plan.monthlyPriceEur}</span>
              <span className="muted">{t("landing.pricing.perMonth")}</span>
              {hasLaunchDiscount(plan) && (
                <>
                  {/* A struck-through price is not announced reliably; the words are. */}
                  <s className="landing-plan__was" aria-hidden="true">
                    €{plan.regularPriceEur}
                  </s>
                  <span className="visually-hidden">{t("landing.pricing.was", { price: plan.regularPriceEur })}</span>
                </>
              )}
            </p>
            <ul className="landing-plan__features">
              {planHighlights(plan).map((line) => (
                <li key={line.key}>{t(line.key, line.params)}</li>
              ))}
            </ul>
            <Link
              to="/register"
              className={`button ${isRecommended(plan) ? "button--primary" : ""} landing-plan__cta`}
            >
              {isTrial(plan) ? t("landing.pricing.startTrial") : t("landing.pricing.choose", { plan: plan.name })}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

