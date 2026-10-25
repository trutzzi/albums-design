import { createHash, randomBytes } from "node:crypto";
import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";
import type { ClientStyle } from "@albumflow/contracts";

export interface StudioProps {
  name: string;
  ownerEmail: string;
  /** Only the hash is stored; the key itself is shown once at creation. */
  apiKeyHash: string;
  createdAt: Date;
  /** What clients see instead of AlbumFlow (Studio Pro). Absent until the studio sets it. */
  branding?: StudioBranding | undefined;
  /** How its client galleries look: fonts, layout, theme, section names, watermark (Studio Pro). */
  clientStyle?: ClientStyle | undefined;
}

export interface StudioBranding {
  displayName: string;
  accent: string | null;
  /** A small PNG as a data: URL. */
  logo: string | null;
  /** How clients reach the studio from the gallery's Contacts card. */
  website: string | null;
  phone: string | null;
  email: string | null;
}

export class Studio extends AggregateRoot<StudioProps> {
  private constructor(props: StudioProps, id: UniqueEntityId) {
    super(props, id);
  }

  static create(props: { name: string; ownerEmail: string }, id?: UniqueEntityId): { studio: Studio; apiKey: string } {
    const apiKey = `af_${randomBytes(24).toString("base64url")}`;
    const studio = new Studio(
      {
        name: props.name,
        ownerEmail: props.ownerEmail,
        apiKeyHash: hashApiKey(apiKey),
        createdAt: new Date(),
      },
      id ?? UniqueEntityId.create(),
    );
    return { studio, apiKey };
  }

  static reconstitute(props: StudioProps, id: UniqueEntityId): Studio {
    return new Studio(props, id);
  }

  get name(): string {
    return this.props.name;
  }

  get ownerEmail(): string {
    return this.props.ownerEmail;
  }

  get apiKeyHash(): string {
    return this.props.apiKeyHash;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get branding(): StudioBranding | undefined {
    return this.props.branding;
  }

  setBranding(branding: StudioBranding | undefined): void {
    this.props.branding = branding;
  }

  get clientStyle(): ClientStyle | undefined {
    return this.props.clientStyle;
  }

  setClientStyle(style: ClientStyle | undefined): void {
    this.props.clientStyle = style;
  }

  rename(name: string): void {
    this.props.name = name;
  }

  rotateApiKey(): string {
    const apiKey = `af_${randomBytes(24).toString("base64url")}`;
    this.props.apiKeyHash = hashApiKey(apiKey);
    return apiKey;
  }
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}
