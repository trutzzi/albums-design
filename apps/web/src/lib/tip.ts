/**
 * Props for a short hint shown just above a control on hover and keyboard focus (see
 * `[data-tip]` in styles.css), and read out by screen readers via aria-description.
 * Used instead of `title`, whose native tooltip is slow, unstyled and absent on touch.
 */
export function tip(text: string): Record<string, string> {
  return { "data-tip": text, "aria-description": text };
}
