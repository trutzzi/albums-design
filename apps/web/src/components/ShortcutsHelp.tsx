import { useEffect } from "react";
import { useLanguage } from "../lib/i18n/LanguageContext";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl";

/** Every key the editor answers to, in one place — opened with "?". */
export const EDITOR_SHORTCUTS: { keys: string[]; labelKey: string }[] = [
  { keys: ["↑", "↓"], labelKey: "shortcuts.spread" },
  { keys: ["←", "→"], labelKey: "shortcuts.design" },
  { keys: [`${MOD} Z`], labelKey: "shortcuts.undo" },
  { keys: [`${MOD} ⇧ Z`], labelKey: "shortcuts.redo" },
  { keys: ["S"], labelKey: "shortcuts.shuffle" },
  { keys: ["M"], labelKey: "shortcuts.mirror" },
  { keys: ["L"], labelKey: "shortcuts.lock" },
  { keys: ["Delete"], labelKey: "shortcuts.remove" },
  { keys: ["Esc"], labelKey: "shortcuts.deselect" },
  { keys: ["P"], labelKey: "shortcuts.preview" },
  { keys: ["C"], labelKey: "shortcuts.check" },
  { keys: ["?"], labelKey: "shortcuts.help" },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => (event.key === "Escape" || event.key === "?") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal shortcuts"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="shortcuts-title">{t("shortcuts.title")}</h2>
        <p className="muted">{t("shortcuts.intro")}</p>
        <dl className="shortcuts__list">
          {EDITOR_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.labelKey} className="shortcuts__row">
              <dt>
                {shortcut.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{t(shortcut.labelKey)}</dd>
            </div>
          ))}
        </dl>
        <div className="modal__actions">
          <button type="button" className="button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
