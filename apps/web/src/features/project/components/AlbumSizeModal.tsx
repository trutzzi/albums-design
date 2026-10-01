import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ALBUM_DIMENSIONS } from "@/features/project/lib/album-dimensions";
import { CUSTOM_DIMENSION_ID, type AlbumSize } from "@/features/project/hooks/useAlbumSize";

/** Picks the print size new albums are built at: a preset, or a custom width and height. */
export function AlbumSizeModal({ size, onClose }: { size: AlbumSize; onClose: () => void }) {
  const { t } = useLanguage();
  const choose = (id: string) => {
    size.setDimensionId(id);
    onClose();
  };
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dimension-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="dimension-modal-title">{t("dimension.modal.title")}</h2>
        <p>{t("dimension.modal.body")}</p>
        <ul className="print-profile-options">
          {ALBUM_DIMENSIONS.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={`print-profile-option ${size.dimensionId === option.id ? "print-profile-option--selected" : ""}`}
                onClick={() => choose(option.id)}
              >
                <strong>{t("dimension.chip", { width: option.widthCm, height: option.heightCm })}</strong>
                <span className="muted">{t(`dimension.shape.${option.shape}`)}</span>
              </button>
            </li>
          ))}
          <li>
            <div
              className={`print-profile-option print-profile-option--custom ${
                size.dimensionId === CUSTOM_DIMENSION_ID ? "print-profile-option--selected" : ""
              }`}
            >
              <strong>{t("dimension.custom")}</strong>
              <div className="print-profile-custom-fields">
                <label>
                  {t("dimension.custom.width")}
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={size.customWidthCm}
                    onChange={(event) => size.setCustomWidthCm(Math.max(1, Number(event.target.value)))}
                  />
                </label>
                <label>
                  {t("dimension.custom.height")}
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={size.customHeightCm}
                    onChange={(event) => size.setCustomHeightCm(Math.max(1, Number(event.target.value)))}
                  />
                </label>
              </div>
              <button type="button" className="button button--small" onClick={() => choose(CUSTOM_DIMENSION_ID)}>
                {t("dimension.useCustom")}
              </button>
            </div>
          </li>
        </ul>
        <div className="modal__actions">
          <button type="button" className="button" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
