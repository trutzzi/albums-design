import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStudioOverview, listPlans, type PlanDto } from "../lib/api";
import { useAuth } from "../app/AuthContext";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { useHowItWorksOpen } from "./HowItWorks";

const SEEN_KEY = "albumflow.launchOffer.seen";

function seen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // No storage: never ambush.
  }
}

/** A plan's price as this studio sees it: the launch price, with the list price struck beside it. */
export function PlanPrice({ plan, launch }: { plan: PlanDto; launch: boolean }) {
  const { t } = useLanguage();
  if (!launch || plan.launchPriceEur === plan.regularPriceEur) {
    return <>{t("studio.plan.price", { price: launch ? plan.launchPriceEur : plan.regularPriceEur })}</>;
  }
  return (
    <>
      {t("studio.plan.price", { price: plan.launchPriceEur })}{" "}
      <s className="plan-price__regular" aria-label={t("launch.regular", { price: plan.regularPriceEur })}>
        {t("studio.plan.price", { price: plan.regularPriceEur })}
      </s>
    </>
  );
}

/**
 * Tells a studio that joined during the launch offer what the plans really cost and that
 * it keeps the launch prices. Shown once per browser, after the "How it works" welcome
 * if that is on screen, so the two never stack.
 */
export function LaunchOfferHost() {
  const { t, language } = useLanguage();
  const { isAuthenticated, studioId } = useAuth();
  const overviewOpen = useHowItWorksOpen();
  const [dismissed, setDismissed] = useState(seen);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const plans = useQuery({ queryKey: ["plans"], queryFn: listPlans, staleTime: Infinity, enabled: isAuthenticated });
  const studio = useQuery({
    queryKey: ["studio", studioId],
    queryFn: () => getStudioOverview(studioId),
    enabled: isAuthenticated && Boolean(studioId) && !dismissed,
  });

  const open = isAuthenticated && !dismissed && !overviewOpen && Boolean(studio.data?.subscription.launchPrice) && Boolean(plans.data);
  const close = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Unavailable storage: it simply shows again next visit.
    }
    setDismissed(true);
  };

  useEffect(() => {
    if (!open) return;
    buttonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const until = new Date(plans.data![0]!.launchPricesUntil).toLocaleDateString(language === "ro" ? "ro-RO" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const paid = plans.data!.filter((plan) => plan.code !== "TRIAL");

  return (
    <div className="modal-overlay" role="presentation" onClick={close}>
      <div
        className="modal launch-offer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-offer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="launch-offer-title">{t("launch.title")}</h2>
        <p>{t("launch.body", { date: until })}</p>
        <ul className="launch-offer__plans">
          {paid.map((plan) => (
            <li key={plan.code}>
              <strong>{plan.name}</strong>
              <span>
                <PlanPrice plan={plan} launch />
              </span>
            </li>
          ))}
        </ul>
        <p className="muted">{t("launch.keep")}</p>
        <div className="modal__actions">
          <button ref={buttonRef} type="button" className="button button--primary" onClick={close}>
            {t("launch.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
