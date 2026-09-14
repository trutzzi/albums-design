import type { UniqueEntityId } from "./unique-entity-id";

export abstract class DomainEvent {
  readonly occurredAt: Date;
  abstract readonly name: string;
  abstract readonly aggregateId: UniqueEntityId;

  protected constructor(occurredAt: Date = new Date()) {
    this.occurredAt = occurredAt;
  }
}
