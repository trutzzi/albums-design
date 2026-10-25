import { z } from "zod";

/**
 * How a Studio Pro studio's client galleries look beyond name, colour and logo. Stored
 * as one validated document so a new option never needs a migration; every field has a
 * default, so a stored style from before an option existed still reads.
 */

/** Curated title fonts — each a Google Fonts family the client page loads on demand. */
export const TITLE_FONTS = ["plex-serif", "cormorant", "playfair", "lora", "montserrat", "josefin"] as const;
export const COVER_LAYOUTS = ["split-left", "split-right", "full"] as const;
/** `auto` follows the client's device and keeps the theme switch; the others fix the look. */
export const GALLERY_THEMES = ["auto", "light", "dark", "cream"] as const;
export const GRID_STYLES = ["masonry", "square"] as const;
export const GRID_SPACINGS = ["tight", "airy"] as const;
export const WATERMARK_POSITIONS = ["center", "tiled", "corner"] as const;

/** A link rendered on client pages: only http(s), never javascript: or data:. */
const webLink = z
  .string()
  .trim()
  .max(200)
  .regex(/^https?:\/\/[^\s]+$/i, "Links start with https://.");

/** The fields a single gallery may change for one shoot. */
export const galleryLookSchema = z.object({
  titleFont: z.enum(TITLE_FONTS).default("plex-serif"),
  coverLayout: z.enum(COVER_LAYOUTS).default("split-left"),
  theme: z.enum(GALLERY_THEMES).default("auto"),
  grid: z.enum(GRID_STYLES).default("masonry"),
  spacing: z.enum(GRID_SPACINGS).default("tight"),
  welcomeMessage: z.string().trim().max(400).nullable().default(null),
});

export const clientStyleSchema = galleryLookSchema.extend({
  /** The studio's own names for photo categories, e.g. `{ COUPLE: "Ședința foto" }`. */
  sectionNames: z
    .record(z.string().regex(/^[A-Z_]{1,32}$/), z.string().trim().min(1).max(40))
    .refine((names) => Object.keys(names).length <= 16, "Too many section names.")
    .default({}),
  social: z
    .object({
      instagram: webLink.nullable().default(null),
      facebook: webLink.nullable().default(null),
      tiktok: webLink.nullable().default(null),
    })
    .default({}),
  /** The studio's logo (or name, without a logo) over album proofs, instead of nothing. */
  watermark: z
    .object({
      enabled: z.boolean().default(false),
      position: z.enum(WATERMARK_POSITIONS).default("center"),
      opacity: z.number().min(0.1).max(0.6).default(0.3),
    })
    .default({}),
});
export type ClientStyle = z.infer<typeof clientStyleSchema>;
export type ClientStyleInput = z.input<typeof clientStyleSchema>;

/** One gallery's departures from the studio style; anything absent follows the studio. */
export const galleryOverrideSchema = galleryLookSchema.partial();
export type GalleryOverride = z.infer<typeof galleryOverrideSchema>;

export const DEFAULT_CLIENT_STYLE: ClientStyle = clientStyleSchema.parse({});

/** Reads a stored style, falling back to the defaults for anything missing or no longer valid. */
export function readClientStyle(stored: unknown): ClientStyle {
  const parsed = clientStyleSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : DEFAULT_CLIENT_STYLE;
}

/** The studio's style with one gallery's choices on top; fields the gallery leaves unset follow the studio. */
export function withOverride(style: ClientStyle, override: GalleryOverride | null | undefined): ClientStyle {
  if (!override) return style;
  const chosen = Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined));
  return { ...style, ...chosen };
}
