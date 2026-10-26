import { useLanguage } from "@/shared/i18n/LanguageContext";
import { neighboursOf, type EditorView } from "@/features/album-editor/lib/editor-view";

/**
 * Above the spreads: the switch between all spreads and one at a time and, in the focus
 * view, where you are with ‹ › to the neighbours. The page strip below still jumps anywhere.
 */
export function FocusBar(props: {
  view: EditorView;
  onViewChange: (view: EditorView) => void;
  index: number;
  count: number;
  onJump: (index: number) => void;
}) {
  const { t } = useLanguage();
  const { previous, next } = neighboursOf(props.index, props.count);
  return (
    <div className="focus-bar">
      <div className="focus-bar__views" role="group" aria-label={t("editor.view.label")}>
        {(["scroll", "focus"] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={props.view === view}
            className={`focus-bar__view ${props.view === view ? "focus-bar__view--on" : ""}`}
            onClick={() => props.onViewChange(view)}
          >
            {t(`editor.view.${view}`)}
          </button>
        ))}
      </div>
      {props.view === "focus" && props.count > 0 && (
        <div className="focus-bar__pager">
          <button
            type="button"
            className="focus-bar__step"
            aria-label={t("editor.focus.previous")}
            disabled={previous === null}
            onClick={() => previous !== null && props.onJump(previous)}
          >
            ‹
          </button>
          <span aria-live="polite">{t("editor.focus.position", { current: props.index + 1, total: props.count })}</span>
          <button
            type="button"
            className="focus-bar__step"
            aria-label={t("editor.focus.next")}
            disabled={next === null}
            onClick={() => next !== null && props.onJump(next)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
