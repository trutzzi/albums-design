import type { LayoutTemplateDTO } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { LayoutPicker } from "./LayoutPicker";

/**
 * Choosing the layout for a brand-new spread. It has no photos yet to narrow the choice
 * down to a single fitting size, so every layout is offered.
 */
export function InsertSpreadModal(props: {
  templates: LayoutTemplateDTO[];
  onPick: (templateId: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="modal-overlay" role="presentation" onClick={props.onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="insert-spread-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="insert-spread-title">{t("spread.insert.modal.title")}</h2>
        <p>{t("spread.insert.modal.body")}</p>
        <LayoutPicker templates={props.templates} photoCount={null} currentTemplateId="" onPick={props.onPick} />
        <div className="modal__actions">
          <button type="button" className="button" onClick={props.onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
