import { createHash, randomBytes } from "node:crypto";
import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";

export interface StudioProps {
  name: string;
  ownerEmail: string;
  /** Only the hash is stored; the key itself is shown once at creation. */
  apiKeyHash: string;
  createdAt: Date;
}

export class Studio extends AggregateRoot<StudioProps> {
  private constructor(props: StudioProps, id: UniqueEntityId) {
    super(props, id);
  }

  static create(
    props: { name: string; ownerEmail: string },
    id?: UniqueEntityId,
  ): { studio: Studio; apiKey: string } {
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
