import {
  COVER_LAYOUTS,
  GALLERY_THEMES,
  GRID_SPACINGS,
  GRID_STYLES,
  TITLE_FONTS,
  type GalleryOverride,
} from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { TITLE_FONT_LABELS, titleFontStack } from "@/shared/lib/client-style";
import { useTitleFont } from "@/shared/ui/ClientBrand";

type Look = GalleryOverride;

/**
 * The look of a client gallery: title font, cover layout, theme, grid, spacing and welcome
 * note. Used for the studio's defaults and, with `inherit`, for one gallery's own choices —
 * where every field can also stay "same as the studio".
 */
export function GalleryLookFields({
  idPrefix,
  value,
  onChange,
  inherit = false,
}: {
  idPrefix: string;
  value: Look;
  onChange: (next: Look) => void;
  /** Offer "Same as studio" on every field; an unset field then follows the studio's style. */
  inherit?: boolean;
}) {
  const { t } = useLanguage();
  // The studio pages never load the client fonts themselves; without this the sample is generic serif.
  useTitleFont(value.titleFont);
  const set = <Key extends keyof Look>(key: Key, next: Look[Key] | "") => {
    const updated = { ...value };
    if (next === "") delete updated[key];
    else updated[key] = next as Look[Key];
    onChange(updated);
  };
  const studioOption = inherit ? <option value="">{t("galleryStyle.sameAsStudio")}</option> : null;

  return (
    <div className="look-fields">
      <div className="field">
        <label htmlFor={`${idPrefix}-font`}>{t("galleryStyle.font")}</label>
        <select
          id={`${idPrefix}-font`}
          value={value.titleFont ?? ""}
          onChange={(event) => set("titleFont", event.target.value as Look["titleFont"] | "")}
        >
          {studioOption}
          {TITLE_FONTS.map((font) => (
            <option key={font} value={font}>
              {TITLE_FONT_LABELS[font]}
            </option>
          ))}
        </select>
        {value.titleFont && (
          <span className="look-fields__sample" style={{ fontFamily: titleFontStack(value.titleFont) }}>
            Andreea &amp; Bogdan
          </span>
        )}
      </div>
      <Choice
        id={`${idPrefix}-cover`}
        label={t("galleryStyle.cover")}
        value={value.coverLayout}
        options={COVER_LAYOUTS}
        optionLabel={(option) => t(`galleryStyle.cover.${option}`)}
        studioOption={studioOption}
        onChange={(next) => set("coverLayout", next)}
      />
      <Choice
        id={`${idPrefix}-theme`}
        label={t("galleryStyle.theme")}
        value={value.theme}
        options={GALLERY_THEMES}
        optionLabel={(option) => t(`galleryStyle.theme.${option}`)}
        studioOption={studioOption}
        onChange={(next) => set("theme", next)}
      />
      <Choice
        id={`${idPrefix}-grid`}
        label={t("galleryStyle.grid")}
        value={value.grid}
        options={GRID_STYLES}
        optionLabel={(option) => t(`galleryStyle.grid.${option}`)}
        studioOption={studioOption}
        onChange={(next) => set("grid", next)}
      />
      <Choice
        id={`${idPrefix}-spacing`}
        label={t("galleryStyle.spacing")}
        value={value.spacing}
        options={GRID_SPACINGS}
        optionLabel={(option) => t(`galleryStyle.spacing.${option}`)}
        studioOption={studioOption}
        onChange={(next) => set("spacing", next)}
      />
      <div className="field look-fields__wide">
        <label htmlFor={`${idPrefix}-welcome`}>{t("galleryStyle.welcome")}</label>
        <textarea
          id={`${idPrefix}-welcome`}
          rows={2}
          maxLength={400}
          value={value.welcomeMessage ?? ""}
          placeholder={inherit ? t("galleryStyle.welcome.inherit") : t("galleryStyle.welcome.placeholder")}
          // Empty means "no message" for the studio, and "the studio's message" for one gallery.
          onChange={(event) =>
            set("welcomeMessage", event.target.value.trim() ? event.target.value : inherit ? "" : null)
          }
        />
      </div>
    </div>
  );
}

function Choice<Option extends string>({
  id,
  label,
  value,
  options,
  optionLabel,
  studioOption,
  onChange,
}: {
  id: string;
  label: string;
  value: Option | undefined;
  options: readonly Option[];
  optionLabel: (option: Option) => string;
  studioOption: React.ReactNode;
  onChange: (next: Option | "") => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value as Option | "")}>
        {studioOption}
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}
