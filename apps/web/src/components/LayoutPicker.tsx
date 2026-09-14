import type { LayoutTemplateDTO } from "@albumflow/contracts";

interface LayoutPickerProps {
  /** Every known template; the picker filters to the ones that fit. */
  templates: LayoutTemplateDTO[];
  /** How many photos this spread holds — only exact matches are offered. */
  photoCount: number;
  currentTemplateId: string;
  disabled?: boolean;
  onPick: (templateId: string) => void;
}

/**
 * A dropdown of layout names asks the photographer to imagine the arrangement.
 * Showing the actual slot geometry lets them recognise it instead.
 */
export function LayoutPicker({
  templates,
  photoCount,
  currentTemplateId,
  disabled,
  onPick,
}: LayoutPickerProps) {
  const options = templates.filter((template) => template.slots.length === photoCount);

  if (options.length === 0) {
    return <p className="muted">No other layout holds {photoCount} photos.</p>;
  }

  return (
    <div className="layout-picker" role="group" aria-label="Spread layout">
      {options.map((template) => {
        const isCurrent = template.id === currentTemplateId;
        return (
          <button
            key={template.id}
            type="button"
            className={`layout-chip ${isCurrent ? "layout-chip--current" : ""}`}
            title={template.name}
            aria-pressed={isCurrent}
            disabled={disabled}
            onClick={() => onPick(template.id)}
          >
            <span className="layout-chip__preview" aria-hidden="true">
              {template.slots.map((slot) => (
                <span
                  key={slot.id}
                  className="layout-chip__slot"
                  style={{
                    left: `${slot.x * 100}%`,
                    top: `${slot.y * 100}%`,
                    width: `${slot.width * 100}%`,
                    height: `${slot.height * 100}%`,
                  }}
                />
              ))}
            </span>
            <span className="layout-chip__name">{template.name}</span>
          </button>
        );
      })}
    </div>
  );
}
