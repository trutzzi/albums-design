import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { AlbumDTO } from "@albumflow/contracts";
import { copyAlbumAtSize, resizeAlbum } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { sizeLabel } from "@/shared/lib/print-size";
import type { CheckInput } from "@/features/album-editor/lib/album-check";
import { sharpnessAt, sizeOptions, type SizeOption } from "@/features/album-editor/lib/album-size";

interface AlbumSizeDialogProps {
  album: AlbumDTO;
  /** What the editor's album check runs on, so the preview matches the Check panel. */
  check: CheckInput;
  onResized: (album: AlbumDTO) => void;
  onCopied: (album: AlbumDTO) => void;
  onClose: () => void;
}

/**
 * Another print size for this album, of the same shape: change this one, or make a copy
 * (the parents' smaller books). Before either, it says what the size does to print
 * sharpness, since a bigger page spreads the same pixels further.
 */
export function AlbumSizeDialog({ album, check, onResized, onCopied, onClose }: AlbumSizeDialogProps) {
  const { t } = useLanguage();
  const options = useMemo(() => sizeOptions(album.format), [album.format]);
  const ratio = album.format.pageHeightMm / album.format.pageWidthMm;
  const [chosen, setChosen] = useState<SizeOption | null>(options[0] ?? null);
  const [customCm, setCustomCm] = useState("");
  const custom: SizeOption | null =
    Number(customCm) >= 5 && Number(customCm) <= 100
      ? { pageWidthMm: Math.round(Number(customCm) * 10), pageHeightMm: Math.round(Number(customCm) * 10 * ratio) }
      : null;
  const size = customCm ? custom : chosen;
  const sharpness = useMemo(() => (size ? sharpnessAt(check, size) : null), [check, size]);
  const locked = album.status === "APPROVED";
  const unchanged =
    size !== null && size.pageWidthMm === album.format.pageWidthMm && size.pageHeightMm === album.format.pageHeightMm;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Opened from the size chip: focus moves into the dialog (so Escape and Tab work there)
  // and goes back to the chip when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => opener?.focus();
  }, []);

  const resize = useMutation({ mutationFn: (to: SizeOption) => resizeAlbum(album.id, to), onSuccess: onResized });
  const copy = useMutation({ mutationFn: (to: SizeOption) => copyAlbumAtSize(album.id, to), onSuccess: onCopied });
  const busy = resize.isPending || copy.isPending;
  const failed = (resize.error ?? copy.error) as Error | null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal album-size"
        role="dialog"
        aria-modal="true"
        aria-labelledby="album-size-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
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
                onChange={() => {
                  setChosen(option);
                  setCustomCm("");
                }}
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
              onChange={(event) => setCustomCm(event.target.value)}
            />
            {custom && <span className="muted">{t("albumSize.custom.result", { size: sizeLabel(custom) })}</span>}
          </label>
        </fieldset>

        {sharpness && (
          <p
            className={`notice ${sharpness.then.soft + sharpness.then.pixelated > 0 ? "" : "notice--good"}`}
            role="status"
          >
            {sharpness.then.pixelated > 0
              ? t("albumSize.sharpness.pixelated", { count: sharpness.then.pixelated, soft: sharpness.then.soft })
              : sharpness.then.soft > sharpness.now.soft
                ? t("albumSize.sharpness.soft", { count: sharpness.then.soft })
                : t("albumSize.sharpness.fine")}
          </p>
        )}
        {locked && <p className="muted">{t("albumSize.locked")}</p>}
        {failed && <p className="error">{failed.message}</p>}

        <div className="modal__actions">
          <button type="button" className="button" onClick={onClose}>
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
