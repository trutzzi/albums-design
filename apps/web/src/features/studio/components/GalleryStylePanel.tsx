import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DEFAULT_CLIENT_STYLE, WATERMARK_POSITIONS, withOverride, type ClientStyle } from "@albumflow/contracts";
import { saveClientStyle, type StudioOverview } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { GalleryLookFields } from "@/shared/ui/GalleryLookFields";

/** The photo categories a gallery is split into, in the order of a wedding day. */
const SECTIONS = ["PREPARATION", "CEREMONY", "PORTRAIT", "COUPLE", "GROUP", "DETAIL", "VENUE", "RECEPTION", "CANDID"];
const NETWORKS = ["instagram", "facebook", "tiktok"] as const;

/**
 * Studio Pro: how every client gallery looks by default — fonts, cover, theme, grid,
 * welcome note, the studio's own names for the parts of the day, social links, and its
 * watermark over album proofs. One gallery can still change its look under Delivery.
 */
export function GalleryStylePanel({
  overview,
  studioId,
  onSaved,
}: {
  overview: StudioOverview;
  studioId: string;
  onSaved: (updated: StudioOverview) => void;
}) {
  const { t } = useLanguage();
  const [style, setStyle] = useState<ClientStyle>(overview.studio.clientStyle ?? DEFAULT_CLIENT_STYLE);
  const save = useMutation({ mutationFn: () => saveClientStyle(studioId, style), onSuccess: onSaved });

  // Studio Pro only; the branding panel above already shows the upsell.
  if (!overview.subscription.whiteLabel) return null;

  const update = (patch: Partial<ClientStyle>) => setStyle((current) => ({ ...current, ...patch }));
  const setSectionName = (section: string, name: string) => {
    const names = { ...style.sectionNames };
    if (name.trim()) names[section] = name;
    else delete names[section];
    update({ sectionNames: names });
  };

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{t("galleryStyle.title")}</h2>
      </div>
      <p className="muted">{t("galleryStyle.intro")}</p>

      <GalleryLookFields
        idPrefix="studio-look"
        value={style}
        onChange={(look) => setStyle((current) => withOverride(current, look))}
      />

      <h3 className="branding__subtitle">{t("galleryStyle.sections")}</h3>
      <p className="muted">{t("galleryStyle.sections.intro")}</p>
      <div className="look-fields">
        {SECTIONS.map((section) => (
          <div key={section} className="field">
            <label htmlFor={`section-${section}`}>{t(`gallery.section.${section}`)}</label>
            <input
              id={`section-${section}`}
              maxLength={40}
              value={style.sectionNames[section] ?? ""}
              placeholder={t(`gallery.section.${section}`)}
              onChange={(event) => setSectionName(section, event.target.value)}
            />
          </div>
        ))}
      </div>

      <h3 className="branding__subtitle">{t("galleryStyle.social")}</h3>
      <div className="look-fields">
        {NETWORKS.map((network) => (
          <div key={network} className="field">
            <label htmlFor={`social-${network}`}>{t(`social.${network}`)}</label>
            <input
              id={`social-${network}`}
              type="url"
              inputMode="url"
              maxLength={200}
              placeholder="https://"
              value={style.social[network] ?? ""}
              onChange={(event) =>
                update({ social: { ...style.social, [network]: event.target.value.trim() || null } })
              }
            />
          </div>
        ))}
      </div>

      <h3 className="branding__subtitle">{t("galleryStyle.watermark")}</h3>
      <p className="muted">{t("galleryStyle.watermark.intro")}</p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={style.watermark.enabled}
          onChange={(event) => update({ watermark: { ...style.watermark, enabled: event.target.checked } })}
        />
        {t("galleryStyle.watermark.enabled")}
      </label>
      {style.watermark.enabled && (
        <div className="look-fields">
          <div className="field">
            <label htmlFor="watermark-position">{t("galleryStyle.watermark.position")}</label>
            <select
              id="watermark-position"
              value={style.watermark.position}
              onChange={(event) =>
                update({
                  watermark: {
                    ...style.watermark,
                    position: event.target.value as ClientStyle["watermark"]["position"],
                  },
                })
              }
            >
              {WATERMARK_POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {t(`galleryStyle.watermark.position.${position}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="watermark-opacity">
              {t("galleryStyle.watermark.opacity", { percent: Math.round(style.watermark.opacity * 100) })}
            </label>
            <input
              id="watermark-opacity"
              type="range"
              min={0.1}
              max={0.6}
              step={0.05}
              value={style.watermark.opacity}
              onChange={(event) => update({ watermark: { ...style.watermark, opacity: Number(event.target.value) } })}
            />
          </div>
        </div>
      )}

      <button type="button" className="button button--primary" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? t("branding.saving") : t("galleryStyle.save")}
      </button>
      {save.isSuccess && !save.isPending && <p className="notice notice--good">{t("galleryStyle.saved")}</p>}
      {save.isError && <p className="error">{(save.error as Error).message}</p>}
    </section>
  );
}
