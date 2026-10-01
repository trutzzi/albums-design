import { useLanguage } from "@/shared/i18n/LanguageContext";
import { tip } from "@/shared/lib/tip";
import type { PrintGuides } from "@/features/album-editor/hooks/usePrintGuides";

/** "Lab standard (300 dpi, 3mm bleed)" → "Lab standard" — the parenthetical is print-shop detail, not something the toolbar chip has room for. */
function shortenProfileName(name: string): string {
  return name.split(" (")[0] ?? name;
}

function Toggle(props: { label: string; tip: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="ruler-toggle" {...tip(props.tip)}>
      <input
        type="checkbox"
        className="ruler-toggle__input"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span className="ruler-toggle__track" aria-hidden="true">
        <span className="ruler-toggle__thumb" />
      </span>
      {props.label}
    </label>
  );
}

/** The editor header's tools: save state, preview and check, history, overlays, and the album's status. */
export function EditorToolbar(props: {
  saving: boolean;
  needsAttention: number;
  onPreview: () => void;
  onCheck: () => void;
  onShortcuts: () => void;
  locked: boolean;
  undo: { run: () => void; disabled: boolean };
  redo: { run: () => void; disabled: boolean };
  showRuler: boolean;
  onShowRulerChange: (show: boolean) => void;
  snapEnabled: boolean;
  onSnapChange: (snap: boolean) => void;
  guides: PrintGuides;
  status: string;
  onReopen: () => void;
  onMarkReady: () => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  const { guides } = props;
  return (
    <div className="page__header-actions" data-tour="editor-tools">
      <span className={`save-state ${props.saving ? "save-state--saving" : ""}`} role="status" aria-live="polite">
        {props.saving ? t("album.saving") : t("album.saved")}
      </span>
      <button type="button" className="button button--small" onClick={props.onPreview} {...tip(t("tip.preview"))}>
        {t("album.preview")}
      </button>
      <button
        type="button"
        className={`button button--small ${props.needsAttention > 0 ? "button--attention" : ""}`}
        onClick={props.onCheck}
        data-tour="editor-check"
        {...tip(t("tip.check"))}
      >
        {t("album.check")}
        {props.needsAttention > 0 && <span className="sidebar__badge">{props.needsAttention}</span>}
      </button>
      <button
        type="button"
        className="button button--small"
        onClick={props.onShortcuts}
        aria-label={t("shortcuts.title")}
        {...tip(t("shortcuts.title"))}
      >
        ?
      </button>
      <button
        type="button"
        className="button button--small"
        disabled={props.undo.disabled}
        onClick={props.undo.run}
        {...tip(t("tip.undo"))}
      >
        {t("album.undo")}
      </button>
      <button
        type="button"
        className="button button--small"
        disabled={props.redo.disabled}
        onClick={props.redo.run}
        {...tip(t("tip.redo"))}
      >
        {t("album.redo")}
      </button>
      <Toggle label={t("album.ruler")} tip={t("tip.ruler")} checked={props.showRuler} onChange={props.onShowRulerChange} />
      <Toggle label={t("album.snap")} tip={t("tip.snap")} checked={props.snapEnabled} onChange={props.onSnapChange} />
      <Toggle
        label={t("album.guides")}
        tip={t("tip.guides")}
        checked={guides.show}
        onChange={(checked) => {
          guides.setShow(checked);
          if (checked) guides.setModalOpen(true);
        }}
      />
      {guides.show && guides.selected && (
        <button type="button" className="print-profile-chip" onClick={() => guides.setModalOpen(true)}>
          {shortenProfileName(guides.selected.name)}
        </button>
      )}
      <span className={`chip chip--${props.status.toLowerCase()}`}>{props.status}</span>
      {props.locked ? (
        <button type="button" className="button" onClick={props.onReopen} data-tour="editor-ready" {...tip(t("tip.reopen"))}>
          {t("album.reopen")}
        </button>
      ) : (
        <button
          type="button"
          className="button"
          onClick={props.onMarkReady}
          data-tour="editor-ready"
          {...tip(t("tip.markReady"))}
        >
          {t("album.markReady")}
        </button>
      )}
      <button
        type="button"
        className="button button--small button--primary"
        onClick={props.onDelete}
        {...tip(t("tip.deleteAlbum"))}
      >
        {t("album.deleteAlbum")}
      </button>
    </div>
  );
}
