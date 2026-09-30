import { useState } from "react";

/**
 * Columns over time, one series in the accent colour. Plain HTML rather than SVG so it
 * reflows at any width without distorting the rounded data-ends. Hovering (or focusing)
 * a column shows its exact value; the whole series is also available as a table.
 */
export function ColumnChart({
  data,
  label,
  format = (value) => value.toLocaleString("en-GB"),
  height = 120,
}: {
  data: { key: string; label: string; value: number | null }[];
  /** What is plotted — also the accessible name. */
  label: string;
  format?: (value: number) => string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((point) => point.value ?? 0)));
  const hovered = active !== null ? data[active] : undefined;

  return (
    <figure className="column-chart" aria-label={label}>
      <div className="column-chart__plot" style={{ height }}>
        <span className="column-chart__tick column-chart__tick--top">{format(max)}</span>
        <span className="column-chart__grid" aria-hidden="true" />
        <div className="column-chart__columns" onMouseLeave={() => setActive(null)}>
          {data.map((point, index) => (
            <button
              key={point.key}
              type="button"
              className={`column-chart__slot ${active === index ? "is-active" : ""}`}
              aria-label={`${point.label}: ${point.value === null ? "no data" : format(point.value)}`}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            >
              <span
                className="column-chart__bar"
                style={{ height: `${max === 0 || point.value === null ? 0 : (point.value / max) * 100}%` }}
              />
            </button>
          ))}
        </div>
        {hovered && active !== null && (
          <div
            className="column-chart__tooltip"
            style={{ left: `${((active + 0.5) / data.length) * 100}%` }}
            role="status"
          >
            <strong>{hovered.value === null ? "—" : format(hovered.value)}</strong>
            <span>{hovered.label}</span>
          </div>
        )}
      </div>
      <div className="column-chart__axis" aria-hidden="true">
        <span>{data[0]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </div>
    </figure>
  );
}

/** Rounds the axis top up to a clean number (1, 2, 5 × 10ⁿ) so the one tick reads cleanly. */
export function niceMax(value: number): number {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Horizontal bars with the value (and an optional note) at the tip — funnels and plan mix. */
export function BarList({
  rows,
  max,
}: {
  rows: { key: string; label: string; value: number; note?: string | undefined }[];
  max?: number | undefined;
}) {
  const top = max ?? Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="bar-list">
      {rows.map((row) => (
        <li key={row.key} className="bar-list__row">
          <span className="bar-list__label">{row.label}</span>
          <span className="bar-list__track">
            <span className="bar-list__bar" style={{ width: `${(row.value / top) * 100}%` }} />
          </span>
          <span className="bar-list__value">
            {row.value.toLocaleString("en-GB")}
            {row.note && <span className="muted"> {row.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StatTile({
  label,
  value,
  detail,
  hero,
}: {
  label: string;
  value: string;
  detail?: string | undefined;
  hero?: boolean | undefined;
}) {
  return (
    <div className={`stat-tile ${hero ? "stat-tile--hero" : ""}`}>
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">{value}</span>
      {detail && <span className="stat-tile__detail">{detail}</span>}
    </div>
  );
}
