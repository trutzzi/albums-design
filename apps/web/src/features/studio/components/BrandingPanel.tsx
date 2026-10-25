import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DEFAULT_CLIENT_STYLE } from "@albumflow/contracts";
import { saveStudioBranding, type StudioOverview } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ClientBrandBar } from "@/shared/ui/ClientBrand";
import { PlanUpsell } from "@/shared/ui/PlanUpsell";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Studio Pro: the name, colour, logo and contact card clients see on review, selection and download pages. */
export function BrandingPanel({
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
  const [website, setWebsite] = useState(saved?.website ?? "");
  const [phone, setPhone] = useState(saved?.phone ?? "");
  const [email, setEmail] = useState(saved?.email ?? "");
  const [fileError, setFileError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      saveStudioBranding(studioId, {
        displayName,
        accent,
        logo,
        // A cleared field removes that detail from the client's contact card.
        website: website.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      }),
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

  const preview = {
    name: displayName.trim() || overview.studio.name,
    accent,
    logo,
    website: website.trim() || null,
    phone: phone.trim() || null,
    email: email.trim() || null,
    style: overview.studio.clientStyle ?? DEFAULT_CLIENT_STYLE,
  };
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
          <h3 className="branding__subtitle">{t("branding.contact.title")}</h3>
          <p className="muted">{t("branding.contact.intro")}</p>
          <div className="field">
            <label htmlFor="brand-website">{t("branding.website")}</label>
            <input
              id="brand-website"
              type="url"
              inputMode="url"
              value={website}
              maxLength={200}
              placeholder="https://"
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="brand-phone">{t("branding.phone")}</label>
            <input
              id="brand-phone"
              type="tel"
              value={phone}
              maxLength={24}
              placeholder="+40 721 000 000"
              onChange={(event) => setPhone(event.target.value)}
            />
            <span className="muted">{t("branding.phone.hint")}</span>
          </div>
          <div className="field">
            <label htmlFor="brand-email">{t("branding.email")}</label>
            <input
              id="brand-email"
              type="email"
              value={email}
              maxLength={320}
              onChange={(event) => setEmail(event.target.value)}
            />
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
