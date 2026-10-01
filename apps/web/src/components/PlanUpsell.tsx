import { useQuery } from "@tanstack/react-query";
import { getStudioOverview, listPlans, type PlanDto } from "../lib/api";
import { useAuth } from "../app/AuthContext";
import { useLanguage } from "../lib/i18n/LanguageContext";

/** Plan changes go through us until self-serve checkout is switched on. */
export const UPGRADE_EMAIL = "contact@valentintruta.ro";

export type UpsellFeature = "downloadLinks" | "branding" | "photos" | "watermark";

/** Whether a plan includes the feature. Branding is the one flag plans do not list publicly. */
const INCLUDES: Record<UpsellFeature, (plan: PlanDto) => boolean> = {
  downloadLinks: (plan) => plan.clientDownloadLinks,
  branding: (plan) => plan.code === "STUDIO_PRO",
  photos: (plan) => plan.maxPhotosPerShoot === null,
  watermark: (plan) => !plan.watermarkDrafts,
};

/**
 * Shown where the studio's plan stops it: what the feature does for them, the cheapest
 * plan that includes it and its price, and one click to ask for it. Renders nothing when
 * the current plan already includes the feature, so a page can always place it.
 */
export function PlanUpsell({ feature }: { feature: UpsellFeature }) {
  const { t } = useLanguage();
  const { studioId } = useAuth();
  const plans = useQuery({ queryKey: ["plans"], queryFn: listPlans, staleTime: Infinity });
  const studio = useQuery({ queryKey: ["studio", studioId], queryFn: () => getStudioOverview(studioId), enabled: Boolean(studioId) });

  const current = plans.data?.find((plan) => plan.code === studio.data?.subscription.planCode);
  if (!current || INCLUDES[feature](current)) return null;
  const target = [...(plans.data ?? [])]
    .filter((plan) => plan.code !== "TRIAL" && INCLUDES[feature](plan))
    .sort((a, b) => a.monthlyPriceEur - b.monthlyPriceEur)[0];
  if (!target) return null;

  const subject = encodeURIComponent(`Upgrade ${studio.data?.studio.name ?? ""} to ${target.name}`.trim());
  return (
    <aside className="upsell" aria-label={t(`upsell.${feature}.title`)}>
      <div className="upsell__text">
        <p className="upsell__title">{t(`upsell.${feature}.title`)}</p>
        <p className="upsell__body">{t(`upsell.${feature}.body`)}</p>
        <p className="upsell__plan">
          {t("upsell.includedIn", { plan: target.name, price: target.monthlyPriceEur, current: current.name })}
        </p>
      </div>
      <a className="button button--primary button--small" href={`mailto:${UPGRADE_EMAIL}?subject=${subject}`}>
        {t("upsell.cta", { plan: target.name })}
      </a>
    </aside>
  );
}
