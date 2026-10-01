import { STYLE_PRESETS, type AlbumStyleDTO } from "@albumflow/contracts";
import { useLanguage } from "../lib/i18n/LanguageContext";

const PRESET_ORDER = ["classic", "modern", "fine-art", "midnight"] as const;

/** The album-wide look: pick a preset, or fine-tune one (which makes it "custom"). */
export function StylePanel({
  style,
  locked,
  onChange,
}: {
  style: AlbumStyleDTO;
  locked: boolean;
  onChange: (style: AlbumStyleDTO) => void;
}) {
  const { t } = useLanguage();
  const tweak = (change: Partial<AlbumStyleDTO>) => onChange({ ...style, ...change, preset: "custom" });

  return (
    <div className="style-panel">
      <p className="muted">{t("style.intro")}</p>
      <div className="style-presets">
        {PRESET_ORDER.map((key) => {
          const preset = STYLE_PRESETS[key];
          return (
            <button
              key={key}
              type="button"
              className={`style-preset ${style.preset === key ? "style-preset--on" : ""}`}
              disabled={locked}
              onClick={() => onChange(preset)}
            >
              <span
                className={`style-preset__swatch ${preset.keyline ? "style-preset__swatch--keyline" : ""}`}
                style={{ background: preset.background }}
                aria-hidden="true"
              >
                <span />
              </span>
              {t(`style.preset.${key}`)}
            </button>
          );
        })}
      </div>

      <div className="field">
        <label htmlFor="style-background">{t("style.background")}</label>
        <input
          id="style-background"
          type="color"
          value={style.background}
          disabled={locked}
          onChange={(event) => tweak({ background: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="style-spacing">{t("style.spacing")}</label>
        <select
          id="style-spacing"
          value={style.spacing}
          disabled={locked}
          onChange={(event) => tweak({ spacing: event.target.value as AlbumStyleDTO["spacing"] })}
        >
          <option value="full">{t("style.spacing.full")}</option>
          <option value="classic">{t("style.spacing.classic")}</option>
          <option value="airy">{t("style.spacing.airy")}</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="style-font">{t("style.font")}</label>
        <select
          id="style-font"
          value={style.font}
          disabled={locked}
          onChange={(event) => tweak({ font: event.target.value as AlbumStyleDTO["font"] })}
        >
          <option value="serif">{t("text.font.serif")}</option>
          <option value="sans">{t("text.font.sans")}</option>
        </select>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={style.keyline}
          disabled={locked}
          onChange={(event) => tweak({ keyline: event.target.checked })}
        />
        {t("style.keyline")}
      </label>
    </div>
  );
}
