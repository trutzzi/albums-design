import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import sharp from "sharp";
import type { PhotoCategoryName } from "../../domain/value-objects/photo-category";
import type { VisionClassifier, VisionVerdict } from "../../application/ports/vision-classifier";

// A JSON schema rather than the SDK's Zod helper: that helper targets Zod v4 and the
// rest of this workspace is on Zod 3.
const verdictSchema = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: [
        "PREPARATION",
        "CEREMONY",
        "PORTRAIT",
        "COUPLE",
        "GROUP",
        "DETAIL",
        "VENUE",
        "RECEPTION",
        "CANDID",
      ],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    face_count: { type: "integer", minimum: 0 },
    face_quality: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["category", "confidence", "face_count", "face_quality"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You classify photographs from wedding, baptism, and event shoots for an album-design tool.

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
confidence is your own certainty in the category, 0-1.`;

const MAX_EDGE = 640;

export interface AnthropicVisionClassifierConfig {
  apiKey?: string | undefined;
  model?: string;
}

/**
 * Cost control matters more than latency here: a wedding is 1,000+ frames, so the
 * image is downscaled hard before upload and the model runs at low effort. Only the
 * culled selects should ever reach this classifier.
 */
export class AnthropicVisionClassifier implements VisionClassifier {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: AnthropicVisionClassifierConfig = {}) {
    this.client = config.apiKey ? new Anthropic({ apiKey: config.apiKey }) : new Anthropic();
    this.model = config.model ?? "claude-opus-5";
  }

  async classify(input: { bytes: Uint8Array }): Promise<VisionVerdict> {
    const preview = await sharp(Buffer.from(input.bytes), { failOn: "none" })
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      output_config: {
        format: jsonSchemaOutputFormat(verdictSchema),
        effort: "low",
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: preview.toString("base64") },
            },
            { type: "text", text: "Classify this photograph." },
          ],
        },
      ],
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error("Vision classifier returned no parsable verdict.");
    }

    return {
      category: parsed.category as PhotoCategoryName,
      confidence: parsed.confidence,
      faceCount: parsed.face_count,
      faceQuality: parsed.face_quality,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
