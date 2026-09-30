import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changePlan,
  getStudioOverview,
  inviteMember,
  listPlans,
  openBillingPortal,
  removeMember,
  upgradePlan,
  type PlanDto,
} from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { LANGUAGES } from "../../lib/i18n/translations";
import { tip } from "../../lib/tip";


export function StudioPage() {
  const { studioId } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState({ name: "", email: "", role: "EDITOR" as const });
  // Stripe sends the browser back here with ?billing=success|cancelled.
  const [params] = useSearchParams();
  const billingReturn = params.get("billing");
  const plans = useQuery({ queryKey: ["plans"], queryFn: listPlans, staleTime: Infinity });

  const overview = useQuery({
    queryKey: ["studio", studioId],
    queryFn: () => getStudioOverview(studioId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["studio", studioId] });

  const addMember = useMutation({
    mutationFn: () => inviteMember(studioId, invite),
    onSuccess: () => {
      setInvite({ name: "", email: "", role: "EDITOR" });
      void invalidate();
    },
  });

  const dropMember = useMutation({
    mutationFn: (memberId: string) => removeMember(studioId, memberId),
    onSuccess: invalidate,
  });

  const switchPlan = useMutation({
    mutationFn: async (planCode: string) => {
      // The trial is never sold; switching back to it only exists without a payment provider.
      if (planCode === "TRIAL") {
        await changePlan(studioId, planCode);
        return;
      }
      const outcome = await upgradePlan(studioId, planCode);
      if (outcome.kind === "redirect") window.location.assign(outcome.url);
    },
    onSuccess: invalidate,
  });

  const manageBilling = useMutation({
    mutationFn: async () => window.location.assign((await openBillingPortal(studioId)).url),
  });

  if (overview.isLoading) return <p className="page muted">{t("common.loading")}</p>;
  if (overview.isError) return <p className="page error">{(overview.error as Error).message}</p>;
  if (!overview.data) return null;

  const { studio, subscription, members, billing } = overview.data;
  const selling = billing.provider !== "none";
  const albumsIncluded = subscription.albumsIncluded ?? Infinity;
  const usedRatio = Number.isFinite(albumsIncluded)
    ? Math.min(1, subscription.albumsUsed / Math.max(1, albumsIncluded))
    : 0;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>{studio.name}</h1>
          <p className="muted">{studio.ownerEmail}</p>
        </div>
        <span className={`chip chip--${subscription.status.toLowerCase()}`}>
          {subscription.planName}
        </span>
      </header>

      <section className="panel">
        <div className="panel__head">
          <h2>{t("studio.billingPeriod")}</h2>
          <p className="muted">
            {new Date(subscription.periodStart).toLocaleDateString()} –{" "}
            {new Date(subscription.periodEnd).toLocaleDateString()}
          </p>
        </div>
        <div className="usage">
          <div className="usage__bar">
            <div className="usage__fill" style={{ width: `${usedRatio * 100}%` }} />
          </div>
          <p className="muted">
            {t("studio.usage", {
              used: subscription.albumsUsed,
              included:
                subscription.albumsIncluded === null
                  ? t("studio.usage.unlimited")
                  : subscription.albumsIncluded,
            })}
            {subscription.albumsRemaining !== null &&
              t("studio.usage.remaining", { count: subscription.albumsRemaining })}
          </p>
        </div>
        {subscription.watermarkDrafts && <p className="notice">{t("studio.watermarkNotice")}</p>}
        {subscription.watermarkExports && <p className="notice">{t("studio.watermarkExportsNotice")}</p>}
        {subscription.status === "PAST_DUE" && <p className="notice notice--danger">{t("studio.billing.pastDue")}</p>}
        {subscription.status === "CANCELLED" && <p className="notice notice--danger">{t("studio.billing.cancelled")}</p>}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>{t("studio.plan.title")}</h2>
          {selling && subscription.hasBillingAccount && (
            <button
              type="button"
              className="button button--small"
              disabled={manageBilling.isPending}
              onClick={() => manageBilling.mutate()}
              {...tip(t("tip.manageBilling"))}
            >
              {t("studio.billing.manage")}
            </button>
          )}
        </div>
        {billingReturn === "success" && <p className="notice notice--good">{t("studio.billing.success")}</p>}
        {billingReturn === "cancelled" && <p className="notice">{t("studio.billing.cancelledCheckout")}</p>}
        <div className="plan-cards">
          {(plans.data ?? []).map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              current={plan.code === subscription.planCode}
              // With Stripe the trial is only ever where a studio starts, never something to buy.
              choosable={!(selling && plan.code === "TRIAL")}
              pending={switchPlan.isPending}
              onChoose={() => switchPlan.mutate(plan.code)}
            />
          ))}
        </div>
        {switchPlan.isError && <p className="error">{(switchPlan.error as Error).message}</p>}
        {manageBilling.isError && <p className="error">{(manageBilling.error as Error).message}</p>}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>{t("language.settings.title")}</h2>
        </div>
        <p className="muted">{t("language.settings.description")}</p>
        <div className="plan-row">
          {LANGUAGES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`button ${language === option.value ? "button--primary" : ""}`}
              onClick={() => setLanguage(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>{t("studio.team.title")}</h2>
          <p className="muted">
            {t("studio.team.seats", {
              used: subscription.seatsUsed,
              included:
                subscription.seatsIncluded === null
                  ? t("studio.usage.unlimited")
                  : subscription.seatsIncluded,
            })}
          </p>
        </div>

        <ul className="member-list">
          {members.map((member) => (
            <li key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <p className="muted">
                  {member.email} · {member.role.toLowerCase()}
                  {!member.accepted && t("studio.team.invitePending")}
                </p>
              </div>
              {member.role !== "OWNER" && (
                <button
                  type="button"
                  className="button button--small button--danger"
                  onClick={() => dropMember.mutate(member.id)}
                >
                  {t("studio.team.remove")}
                </button>
              )}
            </li>
          ))}
        </ul>

        <form
          className="invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            addMember.mutate();
          }}
        >
          <div className="field">
            <label htmlFor="invite-name">{t("studio.invite.name")}</label>
            <input
              id="invite-name"
              value={invite.name}
              required
              onChange={(event) => setInvite((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="invite-email">{t("studio.invite.email")}</label>
            <input
              id="invite-email"
              type="email"
              value={invite.email}
              required
              onChange={(event) => setInvite((prev) => ({ ...prev, email: event.target.value }))}
            />
          </div>
          <button type="submit" className="button" disabled={addMember.isPending}>
            {addMember.isPending ? t("studio.invite.submitting") : t("studio.invite.submit")}
          </button>
        </form>
        {addMember.isError && <p className="error">{(addMember.error as Error).message}</p>}
      </section>
    </div>
  );
}

function PlanCard(props: {
  plan: PlanDto;
  current: boolean;
  choosable: boolean;
  pending: boolean;
  onChoose: () => void;
}) {
  const { t } = useLanguage();
  const { plan } = props;
  return (
    <article className={`plan-card ${props.current ? "plan-card--current" : ""}`}>
      <h3>{plan.name}</h3>
      <p className="plan-card__price">
        {plan.monthlyPriceUsd === 0 ? t("studio.plan.free") : t("studio.plan.price", { price: plan.monthlyPriceUsd })}
      </p>
      <ul>
        <li>
          {plan.albumsPerPeriod === null
            ? t("studio.plan.albumsUnlimited")
            : t("studio.plan.albums", { count: plan.albumsPerPeriod })}
        </li>
        <li>{plan.seats === null ? t("studio.plan.seatsUnlimited") : t("studio.plan.seats", { count: plan.seats })}</li>
        <li>{plan.watermarkDrafts ? t("studio.plan.watermarked") : t("studio.plan.noWatermark")}</li>
      </ul>
      {props.current ? (
        <span className="chip">{t("studio.plan.current")}</span>
      ) : (
        props.choosable && (
          <button
            type="button"
            className="button button--primary"
            disabled={props.pending}
            onClick={props.onChoose}
            {...tip(t("tip.choosePlan"))}
          >
            {t("studio.plan.choose")}
          </button>
        )
      )}
    </article>
  );
}
