import sharp from "sharp";
import { PHOTO_CATEGORIES, type PhotoCategoryName } from "../../domain/value-objects/photo-category";
import type { VisionClassifier, VisionVerdict } from "../../application/ports/vision-classifier";

const MAX_EDGE = 640;

const PROMPT = `You classify photographs from wedding, baptism, and event shoots for an album-design tool.

Judge only what is visible. Definitions:
- PREPARATION: getting ready, hair/makeup, dressing, detail-in-progress moments
- CEREMONY: vows, rings, aisle, officiant, religious rite
- PORTRAIT: one person, deliberately posed
- COUPLE: the two subjects together, posed or intimate
- GROUP: three or more people together, family or bridal party
- DETAIL: objects and close-ups (rings, shoes, invitations, cake, flowers)
- VENUE: rooms, architecture, landscape, table settings with no people as subject
- RECEPTION: dancing, speeches, party, dining
- CANDID: unposed people moments that fit none of the above

face_quality rates how well the visible faces are rendered (in focus, eyes open, unobstructed) from 0-100. Use 0 when no face is visible.
confidence is your own certainty in the category, 0-1.

Respond with strict JSON only, no other text: {"category": "<one of the labels above>", "confidence": <0 to 1>, "face_count": <integer>, "face_quality": <0 to 100>}`;

interface OllamaGenerateResponse {
  response: string;
}

interface RawVerdict {
  category: string;
  confidence: number;
  face_count: number;
  face_quality: number;
}

export interface OllamaVisionClassifierConfig {
  baseUrl?: string | undefined;
  model?: string | undefined;
  /** Aborts a stuck call rather than hanging the whole analysis pipeline on one photo. */
  timeoutMs?: number | undefined;
}

/**
 * Talks to a local Ollama server instead of a paid cloud API — same port, same
 * downscale-then-classify shape as `AnthropicVisionClassifier`, but $0 marginal
 * cost per photo. `isAvailable()` is what the "AI online/offline" status the
 * frontend polls is actually built on.
 */
export class OllamaVisionClassifier implements VisionClassifier {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: OllamaVisionClassifierConfig = {}) {
    this.baseUrl = config.baseUrl ?? "http://localhost:11434";
    // moondream (1.7GB) is ~50x faster but measurably unreliable for this task
    // — verified against real photos, it misjudged people-count constantly
    // (labelling single portraits and even solo photos "GROUP") and would
    // sometimes degenerate into repeating one JSON field hundreds of times.
    // qwen2.5vl:7b got every one of those same photos right.
    this.model = config.model ?? "qwen2.5vl:7b";
    // A cold model load alone measured ~27s; leave headroom above that.
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  async classify(input: { bytes: Uint8Array }): Promise<VisionVerdict> {
    const preview = await sharp(Buffer.from(input.bytes), { failOn: "none" })
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const response = await this.fetchWithTimeout(
      "/api/generate",
      {
        method: "POST",
        body: JSON.stringify({
          model: this.model,
          prompt: PROMPT,
          images: [preview.toString("base64")],
          format: "json",
          stream: false,
          // The expected answer is a handful of short fields — capping
          // output length is what actually stops a small model's occasional
          // repetition loop (e.g. repeating one field hundreds of times)
          // rather than just producing a slow, truncated one.
          options: { temperature: 0.2, num_predict: 150 },
        }),
      },
      this.timeoutMs,
    );
    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status} while classifying a photo.`);
    }

    const body = (await response.json()) as OllamaGenerateResponse;
    const parsed = JSON.parse(body.response) as RawVerdict;
    // Small local models are inconsistent about casing even when the prompt's
    // enum is all-caps — normalise before validating, rather than rejecting
    // (and silently falling back to the heuristic for) an otherwise-correct answer.
    const category = parsed.category.trim().toUpperCase();
    if (!PHOTO_CATEGORIES.includes(category as PhotoCategoryName)) {
      throw new Error(`Ollama returned an unrecognised category: ${parsed.category}`);
    }

    return {
      category: category as PhotoCategoryName,
      confidence: parsed.confidence,
      faceCount: parsed.face_count,
      faceQuality: parsed.face_quality,
    };
  }

  /** A short, cheap ping — lists installed models rather than running one, so it stays fast even while a classify call is in flight. */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout("/api/tags", { method: "GET" }, 2_000);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async fetchWithTimeout(
    path: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
