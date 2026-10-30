import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { AlbumDTO } from "@albumflow/contracts";
import { copyAlbumAtSize, resizeAlbum } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { sizeLabel } from "@/shared/lib/print-size";
import { useDialogFocus } from "@/shared/ui/useDialogFocus";
import type { CheckInput } from "@/features/album-editor/lib/album-check";
import {
  customSize,
  sharpnessAt,
  sharpnessVerdict,
  sizeOptions,
  type SizeOption,
} from "@/features/album-editor/lib/album-size";

interface AlbumSizeDialogProps {
  album: AlbumDTO;
  /**
   * What the editor's album check runs on, so the preview matches the Check panel; null
   * while the shoot's photos or analyses are loading, or if they could not be loaded.
   */
  check: CheckInput | null;
  checkFailed: boolean;
  onResized: (album: AlbumDTO) => void;
  onCopied: (album: AlbumDTO) => void;
  onClose: () => void;
}

/**
 * Another print size for this album, of the same shape: change this one, or make a copy
 * (the parents' smaller books). Before either, it says what the size does to print
 * sharpness, since a bigger page spreads the same pixels further.
 */
export function AlbumSizeDialog({ album, check, checkFailed, onResized, onCopied, onClose }: AlbumSizeDialogProps) {
  const { t } = useLanguage();
  const options = useMemo(() => sizeOptions(album.format), [album.format]);
  const [chosen, setChosen] = useState<SizeOption | null>(options[0] ?? null);
  const [customCm, setCustomCm] = useState("");
  const custom = customSize(customCm, album.format);
  const size = custom === "empty" ? chosen : custom === "outOfRange" ? null : custom;
  const sharpness = useMemo(() => (size && check ? sharpnessAt(check, size) : null), [check, size]);
  const verdict = sharpness ? sharpnessVerdict(sharpness) : null;
  const locked = album.status === "APPROVED";
  const unchanged =
    size !== null && size.pageWidthMm === album.format.pageWidthMm && size.pageHeightMm === album.format.pageHeightMm;
  const dialogRef = useRef<HTMLDivElement>(null);
  // Focus moves in, Tab stays inside, and it returns to the size chip on close.
  useDialogFocus(dialogRef);

  const resize = useMutation({ mutationFn: (to: SizeOption) => resizeAlbum(album.id, to), onSuccess: onResized });
  const copy = useMutation({ mutationFn: (to: SizeOption) => copyAlbumAtSize(album.id, to), onSuccess: onCopied });
  const busy = resize.isPending || copy.isPending;
  // A new choice is a new attempt: the last one's error no longer applies.
  const choose = (next: () => void) => {
    resize.reset();
    copy.reset();
    next();
  };
  const failed = (resize.error ?? copy.error) as Error | null;
  // Closing mid-request would let it land with no dialog (or jump to the copy) unannounced.
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={close}>
      <div
        ref={dialogRef}
        className="modal album-size"
        role="dialog"
        aria-modal="true"
        aria-labelledby="album-size-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && close()}
      >
        <h2 id="album-size-title">{t("albumSize.title")}</h2>
        <p className="muted">{t("albumSize.intro", { size: sizeLabel(album.format) })}</p>

        <fieldset className="album-size__options">
          <legend className="visually-hidden">{t("albumSize.title")}</legend>
          {options.map((option) => (
            <label key={`${option.pageWidthMm}x${option.pageHeightMm}`} className="album-size__option">
              <input
                type="radio"
                name="album-size"
                checked={!customCm && chosen === option}
                onChange={() =>
                  choose(() => {
                    setChosen(option);
                    setCustomCm("");
                  })
                }
              />
              {t("dimension.chip", { width: option.pageWidthMm / 10, height: option.pageHeightMm / 10 })}
            </label>
          ))}
          <label className="album-size__option album-size__custom">
            {t("albumSize.custom")}
            <input
              type="number"
              inputMode="decimal"
              min={5}
              max={100}
              step={0.5}
              value={customCm}
              placeholder={t("albumSize.custom.placeholder")}
              aria-invalid={custom === "outOfRange"}
              aria-describedby="album-size-custom-hint"
              onChange={(event) => {
                const value = event.target.value;
                choose(() => setCustomCm(value));
              }}
            />
            {custom !== "empty" && custom !== "outOfRange" && (
              <span className="muted">{t("albumSize.custom.result", { size: sizeLabel(custom) })}</span>
            )}
          </label>
          {/* Outside the label, and an alert, so a screen reader says why the actions went off. */}
          <p id="album-size-custom-hint" className="error album-size__hint" role="alert">
            {custom === "outOfRange" ? t("albumSize.custom.range") : ""}
          </p>
        </fieldset>

        {sharpness && verdict && (
          <p className={`notice ${verdict === "sharp" ? "notice--good" : ""}`} role="status">
            {verdict === "pixelated"
              ? t("albumSize.sharpness.pixelated", { count: sharpness.then.pixelated, soft: sharpness.then.soft })
              : verdict === "softer"
                ? t("albumSize.sharpness.soft", { count: sharpness.then.soft })
                : verdict === "alreadySoft"
                  ? t("albumSize.sharpness.same", { count: sharpness.then.soft })
                  : verdict === "unchecked"
                    ? t("albumSize.sharpness.unchecked", { count: sharpness.unchecked })
                    : t("albumSize.sharpness.fine")}
          </p>
        )}
        {size && !check && (
          <p className={checkFailed ? "error" : "muted"} role="status">
            {checkFailed ? t("albumSize.sharpness.failed") : t("albumSize.sharpness.loading")}
          </p>
        )}
        {locked && <p className="muted">{t("albumSize.locked")}</p>}
        {failed && <p className="error">{failed.message}</p>}

        <div className="modal__actions">
          <button type="button" className="button" disabled={busy} onClick={close}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="button"
            disabled={!size || unchanged || busy}
            onClick={() => size && copy.mutate(size)}
          >
            {copy.isPending ? t("albumSize.copying") : t("albumSize.copy")}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!size || unchanged || busy || locked}
            onClick={() => size && resize.mutate(size)}
          >
            {resize.isPending ? t("albumSize.changing") : t("albumSize.change")}
          </button>
        </div>
      </div>
    </div>
  );
}
