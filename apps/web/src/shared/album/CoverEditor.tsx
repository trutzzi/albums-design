import { useEffect, useState } from "react";
import {
  focusedBaseCrop,
  isUntouchedCrop,
  textColorOn,
  type AlbumCoverDTO,
  type AlbumStyleDTO,
  type PhotoFocus,
} from "@albumflow/contracts";
import { cropToStyle } from "./crop-geometry";
import { textStyle } from "./SpreadTexts";
import { useLanguage } from "@/shared/i18n/LanguageContext";

const FULL_CROP = { x: 0, y: 0, width: 1, height: 1 };

/**
 * The front cover as it will print: the same positions and type sizes the PDF renderer
 * uses. Read-only when `onChange` is absent (the client's proof).
 */
export function CoverPreview({
  cover,
  albumStyle,
  aspectRatio,
  previewUrl,
  focus,
  onPhotoDrop,
}: {
  cover: AlbumCoverDTO;
  albumStyle: AlbumStyleDTO;
  /** One page's width ÷ height. */
  aspectRatio: number;
  previewUrl: string | null | undefined;
  /** Where the cover photo's subject sits; an untouched crop centres on it, as the PDF does. */
  focus?: PhotoFocus | null | undefined;
  onPhotoDrop?: ((photoId: string) => void) | undefined;
}) {
  const { t } = useLanguage();
  const [dropActive, setDropActive] = useState(false);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const crop =
    imageAspect === null
      ? null
      : isUntouchedCrop(cover.crop)
        ? focusedBaseCrop(imageAspect, aspectRatio, focus)
        : cover.crop;
  const onPhoto = cover.layout === "photo" && cover.photoId !== null;
  const color = onPhoto ? "#ffffff" : textColorOn(albumStyle.background);
  const titleTop = onPhoto ? 0.72 : 0.36;

  return (
    <div
      className={`cover-preview ${dropActive ? "cover-preview--drop" : ""}`}
      style={{ aspectRatio: String(aspectRatio), background: onPhoto ? "#000" : albumStyle.background }}
      onDragOver={
        onPhotoDrop
          ? (event) => {
              event.preventDefault();
              setDropActive(true);
            }
          : undefined
      }
      onDragLeave={() => setDropActive(false)}
      onDrop={
        onPhotoDrop
          ? (event) => {
              event.preventDefault();
              setDropActive(false);
              const photoId = event.dataTransfer.getData("text/photo-id");
              if (photoId) onPhotoDrop(photoId);
            }
          : undefined
      }
    >
      {onPhoto && previewUrl && (
        <img
          src={previewUrl}
          alt=""
          className="cover-preview__photo"
          style={
            crop && imageAspect
              ? { ...cropToStyle(crop, imageAspect, aspectRatio), inset: "auto", objectFit: "fill" }
              : undefined
          }
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth && naturalHeight) setImageAspect(naturalWidth / naturalHeight);
          }}
        />
      )}
      {onPhoto && <div className="cover-preview__band" />}
      {cover.layout === "photo" && cover.photoId === null && onPhotoDrop && (
        <span className="cover-preview__hint">{t("cover.dropPhoto")}</span>
      )}
      <div
        className="cover-preview__text"
        style={{
          top: `${titleTop * 100}%`,
          ...textStyle({ size: "title", align: "center" }, albumStyle, aspectRatio, color),
        }}
      >
        {cover.title}
      </div>
      <div
        className="cover-preview__text"
        style={{
          top: `${(titleTop + 0.13) * 100}%`,
          ...textStyle({ size: "body", align: "center" }, albumStyle, aspectRatio, color),
        }}
      >
        {cover.subtitle}
      </div>
    </div>
  );
}

/** Adds, edits and removes the album's cover, at the top of the editor. */
export function CoverEditor({
  cover,
  albumStyle,
  aspectRatio,
  albumTitle,
  previewUrlFor,
  focusFor,
  locked,
  onChange,
}: {
  cover: AlbumCoverDTO | null;
  albumStyle: AlbumStyleDTO;
  aspectRatio: number;
  albumTitle: string;
  previewUrlFor: (photoId: string) => string | null | undefined;
  focusFor?: ((photoId: string) => PhotoFocus | null | undefined) | undefined;
  locked: boolean;
  onChange: (cover: AlbumCoverDTO | null) => void;
}) {
  const { t } = useLanguage();
  // Typing stays local until the field is left, so each keystroke is not a server round trip.
  const [title, setTitle] = useState(cover?.title ?? "");
  const [subtitle, setSubtitle] = useState(cover?.subtitle ?? "");
  useEffect(() => {
    setTitle(cover?.title ?? "");
    setSubtitle(cover?.subtitle ?? "");
  }, [cover?.title, cover?.subtitle]);

  if (!cover) {
    return (
      <section className="cover-editor cover-editor--empty" data-tour="editor-cover">
        <div>
          <h2>{t("cover.title")}</h2>
          <p className="muted">{t("cover.intro")}</p>
        </div>
        <button
          type="button"
          className="button"
          disabled={locked}
          onClick={() => onChange({ layout: "photo", photoId: null, crop: FULL_CROP, title: albumTitle, subtitle: "" })}
        >
          {t("cover.add")}
        </button>
      </section>
    );
  }

  return (
    <section className="cover-editor" data-tour="editor-cover">
      <CoverPreview
        cover={{ ...cover, title, subtitle }}
        albumStyle={albumStyle}
        aspectRatio={aspectRatio}
        previewUrl={cover.photoId ? previewUrlFor(cover.photoId) : null}
        focus={cover.photoId ? focusFor?.(cover.photoId) : null}
        onPhotoDrop={
          locked ? undefined : (photoId) => onChange({ ...cover, layout: "photo", photoId, crop: FULL_CROP })
        }
      />
      <div className="cover-editor__fields">
        <h2>{t("cover.title")}</h2>
        <div className="field">
          <label htmlFor="cover-title">{t("cover.heading")}</label>
          <input
            id="cover-title"
            value={title}
            maxLength={120}
            disabled={locked}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => title !== cover.title && onChange({ ...cover, title })}
          />
        </div>
        <div className="field">
          <label htmlFor="cover-subtitle">{t("cover.subtitle")}</label>
          <input
            id="cover-subtitle"
            value={subtitle}
            maxLength={200}
            disabled={locked}
            placeholder={t("cover.subtitle.placeholder")}
            onChange={(event) => setSubtitle(event.target.value)}
            onBlur={() => subtitle !== cover.subtitle && onChange({ ...cover, subtitle })}
          />
        </div>
        <div className="plan-row">
          {(["photo", "text"] as const).map((layout) => (
            <button
              key={layout}
              type="button"
              className={`button button--small ${cover.layout === layout ? "button--primary" : ""}`}
              disabled={locked}
              onClick={() => onChange({ ...cover, layout })}
            >
              {t(`cover.layout.${layout}`)}
            </button>
          ))}
        </div>
        {cover.layout === "photo" && <p className="muted">{t("cover.photoHint")}</p>}
        <button
          type="button"
          className="button button--small button--danger"
          disabled={locked}
          onClick={() => onChange(null)}
        >
          {t("cover.remove")}
        </button>
      </div>
    </section>
  );
}
