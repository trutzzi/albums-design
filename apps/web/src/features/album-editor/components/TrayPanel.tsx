import { MAX_PHOTOS_PER_SPREAD, type PhotoAnalysisDTO } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import type { TrayDensity } from "@/features/album-editor/lib/tray-grid";
import type { TrayShow } from "@/features/album-editor/lib/tray-filter";
import type { PhotoTrayState, TraySort } from "@/features/album-editor/hooks/usePhotoTray";
import { PhotoTray } from "./PhotoTray";

/** The sidebar's photo tab: sort, filters and view size above the tray, and the set being built into a spread. */
export function TrayPanel(props: {
  tray: PhotoTrayState;
  hidden: boolean;
  locked: boolean;
  /** What a tray click does right now: grow this spread, fill this slot, or neither. */
  addingToSpread: number | null;
  selectedSpread: number | null;
  picked: string[];
  onClearPicked: () => void;
  onAddPicked: () => void;
  addingPicked: boolean;
  /** Failures of the edits a tray click or drag can start, shown in this order. */
  errors: (Error | null)[];
  onPhotoClick: (photoId: string) => void;
  analysisByPhoto: Map<string, PhotoAnalysisDTO>;
  rankedCount: number;
  usedPhotoIds: Set<string>;
  clientPickedIds: Set<string>;
}) {
  const { t, language } = useLanguage();
  const { tray, picked } = props;
  const formatCount = (value: number) => value.toLocaleString(language === "ro" ? "ro-RO" : "en-GB");
  const categoryLabel = (category: string) => {
    const key = `album.photoTray.category.${category}`;
    const label = t(key);
    return label === key ? category.toLowerCase() : label;
  };

  return (
    <section className={`panel panel--tray ${props.hidden ? "is-hidden" : ""}`}>
      <div className="panel__head">
        <h2>{t("album.photoTray.title")}</h2>
        <label className="tray-sort">
          {t("album.photoTray.sortBy")}
          <select value={tray.sort} onChange={(event) => tray.setSort(event.target.value as TraySort)}>
            <option value="score">{t("album.photoTray.sort.score")}</option>
            <option value="category">{t("album.photoTray.sort.category")}</option>
            <option value="filename">{t("album.photoTray.sort.filename")}</option>
            <option value="similarity">{t("album.photoTray.sort.similarity")}</option>
          </select>
        </label>
      </div>
      <div className="tray-tools">
        <div className="tray-search">
          <input
            type="search"
            value={tray.search}
            placeholder={t("album.photoTray.filter.search")}
            aria-label={t("album.photoTray.filter.search")}
            onChange={(event) => tray.setSearch(event.target.value)}
          />
        </div>
        <div className="tray-chips" role="group" aria-label={t("album.photoTray.filter.show")}>
          {(
            [
              ["all", t("album.photoTray.chip.all"), tray.counts.all],
              ["picks", `♥ ${t("album.photoTray.chip.picks")}`, tray.counts.picks],
              ["unused", t("album.photoTray.chip.unused"), tray.counts.unused],
              ["used", t("album.photoTray.chip.used"), tray.counts.used],
              ["worthy", t("album.photoTray.chip.worthy"), tray.counts.worthy],
            ] as [TrayShow, string, number][]
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              className={`tray-chip ${tray.show === value ? "tray-chip--on" : ""}`}
              aria-pressed={tray.show === value}
              title={value === "picks" ? t("album.photoTray.clientPicked") : undefined}
              onClick={() => tray.setShow(value)}
            >
              {label} <span className="tray-chip__count">{formatCount(count)}</span>
            </button>
          ))}
        </div>
        <div className="tray-tools__row">
          <select
            aria-label={t("album.photoTray.filter.type")}
            value={tray.category}
            onChange={(event) => tray.setCategory(event.target.value)}
          >
            <option value="">{t("album.photoTray.filter.anyType")}</option>
            {tray.categories.map((category) => (
              <option key={category} value={category}>
                {categoryLabel(category)}
              </option>
            ))}
          </select>
          <div className="tray-view" role="group" aria-label={t("album.photoTray.view.size")}>
            {(["s", "m", "l"] as TrayDensity[]).map((size) => (
              <button
                key={size}
                type="button"
                className={`tray-view__button ${tray.prefs.density === size ? "tray-view__button--on" : ""}`}
                aria-pressed={tray.prefs.density === size}
                title={t(`album.photoTray.view.${size}`)}
                onClick={() => tray.updatePrefs({ density: size })}
              >
                {size.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              className={`tray-view__button tray-view__wide ${tray.prefs.wide ? "tray-view__button--on" : ""}`}
              aria-pressed={tray.prefs.wide}
              title={t(tray.prefs.wide ? "album.photoTray.view.narrower" : "album.photoTray.view.wider")}
              onClick={() => tray.updatePrefs({ wide: !tray.prefs.wide })}
            >
              ↔
            </button>
          </div>
        </div>
        {tray.filtering && (
          <p className="muted tray-tools__count">
            {t("album.photoTray.filter.showing", {
              shown: formatCount(tray.visible.length),
              total: formatCount(tray.all.length),
            })}{" "}
            <button type="button" className="link-button" onClick={() => tray.clearFilters()}>
              {t("album.photoTray.filter.clear")}
            </button>
          </p>
        )}
      </div>
      <p className="muted">
        {props.addingToSpread !== null
          ? `Click a photo to add it to spread ${props.addingToSpread + 1}.`
          : props.selectedSpread !== null
            ? `Click a photo to drop it into spread ${props.selectedSpread + 1}.`
            : "Pick photos to build a new spread, or drag one onto any slot."}
      </p>

      {picked.length > 0 && (
        <div className="picked-bar">
          <span>
            {picked.length} selected
            {picked.length > MAX_PHOTOS_PER_SPREAD && ` — a spread holds at most ${MAX_PHOTOS_PER_SPREAD}`}
          </span>
          <div className="picked-bar__actions">
            <button type="button" className="button button--small" onClick={props.onClearPicked}>
              Clear
            </button>
            <button
              type="button"
              className="button button--small button--primary"
              disabled={props.locked || picked.length > MAX_PHOTOS_PER_SPREAD || props.addingPicked}
              onClick={props.onAddPicked}
            >
              {props.addingPicked ? "Adding…" : "Add as spread"}
            </button>
          </div>
        </div>
      )}
      {props.errors.map((error, index) =>
        error ? (
          <p key={index} className="error">
            {error.message}
          </p>
        ) : null,
      )}

      {tray.filtering && tray.visible.length === 0 && (
        <p className="muted">
          {tray.show === "picks" && tray.counts.picks === 0
            ? t("album.photoTray.noSelections")
            : t("album.photoTray.filter.none")}
        </p>
      )}
      <div className="tray-frame">
        <PhotoTray
          density={tray.prefs.density}
          resetKey={`${tray.show}|${tray.category}|${tray.search}|${tray.sort}`}
          photos={tray.visible}
          picked={picked}
          locked={props.locked}
          onPhotoClick={props.onPhotoClick}
          analysisByPhoto={props.analysisByPhoto}
          rankByPhoto={tray.rankByPhoto}
          rankedCount={props.rankedCount}
          usedPhotoIds={props.usedPhotoIds}
          clientPickedIds={props.clientPickedIds}
        />
      </div>
    </section>
  );
}
