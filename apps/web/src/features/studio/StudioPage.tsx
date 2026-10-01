import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getStudioOverview,
  inviteMember,
  listPlans,
  openBillingPortal,
  removeMember,
  saveStudioBranding,
  type PlanDto,
  type StudioOverview,
} from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { LANGUAGES } from "../../lib/i18n/translations";
import { tip } from "../../lib/tip";
import { ClientBrandBar } from "../../components/ClientBrand";
import { PlanUpsell } from "../../components/PlanUpsell";
import { PlanPrice } from "../../components/LaunchOffer";


export function StudioPage() {
  const { studioId } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState({ name: "", email: "", role: "EDITOR" as const });
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
        <p className="muted">{t("studio.plan.contact")}</p>
        {subscription.launchPrice && <p className="notice notice--good">{t("launch.studioNote")}</p>}
        <div className="plan-cards">
          {(plans.data ?? []).map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              current={plan.code === subscription.planCode}
              launch={subscription.launchPrice}
            />
          ))}
        </div>
        {manageBilling.isError && <p className="error">{(manageBilling.error as Error).message}</p>}
      </section>

      <BrandingPanel overview={overview.data} studioId={studioId} onSaved={(updated) => queryClient.setQueryData(["studio", studioId], updated)} />

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

function PlanCard(props: { plan: PlanDto; current: boolean; launch: boolean }) {
  const { t } = useLanguage();
  const { plan } = props;
  return (
    <article className={`plan-card ${props.current ? "plan-card--current" : ""}`}>
      <h3>{plan.name}</h3>
      <p className="plan-card__price">
        <PlanPrice plan={plan} launch={props.launch} />
      </p>
      <ul>
        <li>
          {plan.albumsPerPeriod === null
            ? t("studio.plan.albumsUnlimited")
            : t("studio.plan.albums", { count: plan.albumsPerPeriod })}
        </li>
        <li>{plan.seats === null ? t("studio.plan.seatsUnlimited") : t("studio.plan.seats", { count: plan.seats })}</li>
        <li>
          {plan.maxPhotosPerShoot === null
            ? t("studio.plan.photosUnlimited")
            : t("studio.plan.photos", { count: plan.maxPhotosPerShoot })}
        </li>
        {plan.clientDownloadLinks && <li>{t("studio.plan.downloadLinks")}</li>}
        <li>{plan.watermarkDrafts ? t("studio.plan.watermarked") : t("studio.plan.noWatermark")}</li>
        {plan.watermarkExports && <li>{t("studio.plan.watermarkedExports")}</li>}
      </ul>
      {props.current && <span className="chip">{t("studio.plan.current")}</span>}
    </article>
  );
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Studio Pro: the name, colour and logo clients see on review, selection and download pages. */
function BrandingPanel({
  overview,
  studioId,
  onSaved,
}: {
  overview: StudioOverview;
  studioId: string;
  onSaved: (updated: StudioOverview) => void;
}) {
  const { t } = useLanguage();
  const saved = overview.studio.branding;
  const [displayName, setDisplayName] = useState(saved?.displayName ?? "");
  const [accent, setAccent] = useState<string | null>(saved?.accent ?? null);
  const [logo, setLogo] = useState<string | null>(saved?.logo ?? null);
  const [fileError, setFileError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => saveStudioBranding(studioId, { displayName, accent, logo }),
    onSuccess: onSaved,
  });

  if (!overview.subscription.whiteLabel) {
    return (
      <section className="panel">
        <div className="panel__head">
          <h2>{t("branding.title")}</h2>
        </div>
        <p className="muted">{t("branding.proOnly")}</p>
        <PlanUpsell feature="branding" />
      </section>
    );
  }

  const preview = { name: displayName.trim() || overview.studio.name, accent, logo };
  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{t("branding.title")}</h2>
      </div>
      <p className="muted">{t("branding.intro")}</p>
      <div className="branding">
        <div className="branding__fields">
          <div className="field">
            <label htmlFor="brand-name">{t("branding.name")}</label>
            <input
              id="brand-name"
              value={displayName}
              maxLength={80}
              placeholder={overview.studio.name}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="brand-accent">{t("branding.accent")}</label>
            <div className="branding__row">
              <input
                id="brand-accent"
                type="color"
                value={accent ?? "#ad5522"}
                onChange={(event) => setAccent(event.target.value)}
              />
              {accent && (
                <button type="button" className="link-button" onClick={() => setAccent(null)}>
                  {t("branding.accent.reset")}
                </button>
              )}
            </div>
          </div>
          <div className="field">
            <label htmlFor="brand-logo">{t("branding.logo")}</label>
            <input
              id="brand-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setFileError(null);
                if (!file) return;
                if (file.size > MAX_LOGO_BYTES) {
                  setFileError(t("branding.logo.tooBig"));
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setLogo(typeof reader.result === "string" ? reader.result : null);
                reader.readAsDataURL(file);
              }}
            />
            <span className="muted">{t("branding.logo.hint")}</span>
            {logo && (
              <button type="button" className="link-button branding__remove" onClick={() => setLogo(null)}>
                {t("branding.logo.remove")}
              </button>
            )}
            {fileError && <p className="error">{fileError}</p>}
          </div>
        </div>
        <div className="branding__preview" style={accent ? ({ "--accent": accent } as React.CSSProperties) : undefined}>
          <span className="muted">{t("branding.preview")}</span>
          <ClientBrandBar branding={preview} />
          <span className="button button--primary branding__sample">{t("branding.sampleButton")}</span>
        </div>
      </div>
      <button type="button" className="button button--primary" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? t("branding.saving") : t("branding.save")}
      </button>
      {save.isSuccess && !save.isPending && <p className="notice notice--good">{t("branding.saved")}</p>}
      {save.isError && <p className="error">{(save.error as Error).message}</p>}
    </section>
  );
}
