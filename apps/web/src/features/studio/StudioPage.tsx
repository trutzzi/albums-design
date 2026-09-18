import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { changePlan, getStudioOverview, inviteMember, removeMember } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { LANGUAGES } from "../../lib/i18n/translations";

const PLAN_ORDER = ["TRIAL", "STARTER", "STUDIO", "STUDIO_PRO"] as const;

export function StudioPage() {
  const { studioId } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState({ name: "", email: "", role: "EDITOR" as const });

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
    mutationFn: (planCode: string) => changePlan(studioId, planCode),
    onSuccess: (updated) => queryClient.setQueryData(["studio", studioId], updated),
  });

  if (overview.isLoading) return <p className="page muted">{t("common.loading")}</p>;
  if (overview.isError) return <p className="page error">{(overview.error as Error).message}</p>;
  if (!overview.data) return null;

  const { studio, subscription, members } = overview.data;
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
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>{t("studio.plan.title")}</h2>
        </div>
        <div className="plan-row">
          {PLAN_ORDER.map((code) => (
            <button
              key={code}
              type="button"
              className={`button ${code === subscription.planCode ? "button--primary" : ""}`}
              disabled={switchPlan.isPending || code === subscription.planCode}
              onClick={() => switchPlan.mutate(code)}
            >
              {code.replace("_", " ")}
            </button>
          ))}
        </div>
        {switchPlan.isError && <p className="error">{(switchPlan.error as Error).message}</p>}
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
