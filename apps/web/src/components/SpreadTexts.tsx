import { useRef } from "react";
import {
  TEXT_LINE_HEIGHT,
  TEXT_SIZE_RATIO,
  textColorOn,
  type AlbumFont,
  type AlbumStyleDTO,
  type TextBlockDTO,
  type TextSize,
} from "@albumflow/contracts";
import { useLanguage } from "../lib/i18n/LanguageContext";

const MIN_TEXT_SIZE = 0.04;

export const FONT_STACKS: Record<AlbumFont, string> = {
  serif: '"IBM Plex Serif", Georgia, serif',
  sans: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
};

/**
 * The CSS for one text block, matching the PDF renderer: size as a share of the page
 * height (the spread's height), IBM Plex in both, sans headings set heavier.
 * `aspectRatio` is the spread's width ÷ height, used to express that in container width
 * units — the spread is a size container (see `.spread` in styles.css).
 */
export function textStyle(
  block: Pick<TextBlockDTO, "size" | "align" | "font">,
  albumStyle: AlbumStyleDTO,
  aspectRatio: number,
  color?: string,
): React.CSSProperties {
  const font = block.font ?? albumStyle.font;
  return {
    fontFamily: FONT_STACKS[font],
    fontWeight: font === "sans" && isStrong(block.size) ? 600 : 400,
    fontSize: `${(TEXT_SIZE_RATIO[block.size] * 100) / aspectRatio}cqw`,
    lineHeight: TEXT_LINE_HEIGHT,
    textAlign: block.align,
    color: color ?? textColorOn(albumStyle.background),
  };
}

function isStrong(size: TextSize): boolean {
  return size === "heading" || size === "title";
}

export interface SpreadTextsProps {
  texts: TextBlockDTO[];
  albumStyle: AlbumStyleDTO;
  aspectRatio: number;
  selectedTextId?: string | null | undefined;
  /** Absent means read-only: the client proof and a locked album. */
  onSelect?: ((blockId: string) => void) | undefined;
  /** Live while typing or dragging; `commit` marks the change as settled. */
  onChange?: ((block: TextBlockDTO, commit: boolean) => void) | undefined;
  onRemove?: ((blockId: string) => void) | undefined;
}

/** The words on a spread, drawn over the photos in the spread's own coordinates. */
export function SpreadTexts({
  texts,
  albumStyle,
  aspectRatio,
  selectedTextId,
  onSelect,
  onChange,
  onRemove,
}: SpreadTextsProps) {
  const { t } = useLanguage();
  const gesture = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origin: TextBlockDTO;
    bounds: DOMRect;
  } | null>(null);

  const begin = (event: React.PointerEvent, block: TextBlockDTO, mode: "move" | "resize") => {
    const spread = (event.currentTarget as HTMLElement).closest(".spread");
    if (!spread || !onChange) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    gesture.current = {
      id: block.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: block,
      bounds: spread.getBoundingClientRect(),
    };
  };

  const move = (event: React.PointerEvent) => {
    const active = gesture.current;
    if (!active || !onChange) return;
    const dx = (event.clientX - active.startX) / active.bounds.width;
    const dy = (event.clientY - active.startY) / active.bounds.height;
    const { origin } = active;
    const next =
      active.mode === "move"
        ? {
            ...origin,
            x: clamp(origin.x + dx, 0, 1 - origin.width),
            y: clamp(origin.y + dy, 0, 1 - origin.height),
          }
        : {
            ...origin,
            width: clamp(origin.width + dx, MIN_TEXT_SIZE, 1 - origin.x),
            height: clamp(origin.height + dy, MIN_TEXT_SIZE, 1 - origin.y),
          };
    onChange(next, false);
  };

  const end = (event: React.PointerEvent, block: TextBlockDTO) => {
    if (!gesture.current) return;
    gesture.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    onChange?.(block, true);
  };

  return (
    <>
      {texts.map((block) => {
        const selected = selectedTextId === block.id;
        const editable = Boolean(onChange) && selected;
        return (
          <div
            key={block.id}
            className={`text-block ${onSelect ? "text-block--interactive" : ""} ${selected ? "text-block--selected" : ""}`}
            style={{
              left: `${block.x * 100}%`,
              top: `${block.y * 100}%`,
              width: `${block.width * 100}%`,
              height: `${block.height * 100}%`,
            }}
            onClick={
              onSelect
                ? (event) => {
                    event.stopPropagation();
                    onSelect(block.id);
                  }
                : undefined
            }
            onPointerDown={editable ? (event) => begin(event, block, "move") : undefined}
            onPointerMove={editable ? move : undefined}
            onPointerUp={editable ? (event) => end(event, block) : undefined}
          >
            <div className="text-block__words" style={textStyle(block, albumStyle, aspectRatio)}>
              {block.text || (onChange ? t("text.placeholder") : "")}
            </div>
            {editable && (
              <span
                className="text-block__handle"
                onPointerDown={(event) => begin(event, block, "resize")}
                onPointerMove={move}
                onPointerUp={(event) => end(event, block)}
              />
            )}
          </div>
        );
      })}
      {texts.map((block) =>
        onChange && selectedTextId === block.id ? (
          <TextTools key={`tools-${block.id}`} block={block} onChange={onChange} onRemove={onRemove} />
        ) : null,
      )}
    </>
  );
}

/** Edits one block's words and type, anchored under the block like the photo tools. */
function TextTools({
  block,
  onChange,
  onRemove,
}: {
  block: TextBlockDTO;
  onChange: (block: TextBlockDTO, commit: boolean) => void;
  onRemove?: ((blockId: string) => void) | undefined;
}) {
  const { t } = useLanguage();
  return (
    <div
      className="text-tools"
      style={{ left: `${block.x * 100}%`, top: `${(block.y + block.height) * 100}%`, width: `${Math.max(block.width, 0.34) * 100}%` }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <textarea
        aria-label={t("text.words")}
        value={block.text}
        rows={2}
        autoFocus
        onChange={(event) => onChange({ ...block, text: event.target.value }, false)}
        onBlur={() => onChange(block, true)}
      />
      <div className="text-tools__row">
        <select
          aria-label={t("text.size")}
          value={block.size}
          onChange={(event) => onChange({ ...block, size: event.target.value as TextSize }, true)}
        >
          {(["title", "heading", "body", "caption"] as const).map((size) => (
            <option key={size} value={size}>
              {t(`text.size.${size}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("text.font")}
          value={block.font ?? ""}
          onChange={(event) => {
            const { font: _ignored, ...rest } = block;
            const value = event.target.value as AlbumFont | "";
            onChange(value ? { ...rest, font: value } : rest, true);
          }}
        >
          <option value="">{t("text.font.album")}</option>
          <option value="serif">{t("text.font.serif")}</option>
          <option value="sans">{t("text.font.sans")}</option>
        </select>
        {(["left", "center", "right"] as const).map((align) => (
          <button
            key={align}
            type="button"
            className={`slot-tools__button ${block.align === align ? "is-active" : ""}`}
            title={t(`text.align.${align}`)}
            onClick={() => onChange({ ...block, align }, true)}
          >
            {align === "left" ? "⇤" : align === "center" ? "↔" : "⇥"}
          </button>
        ))}
        {onRemove && (
          <button type="button" className="slot-tools__button slot-tools__button--danger" onClick={() => onRemove(block.id)}>
            {t("text.remove")}
          </button>
        )}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
