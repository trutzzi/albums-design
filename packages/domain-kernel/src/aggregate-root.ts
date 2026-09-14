import { Entity } from "./entity";
import type { DomainEvent } from "./domain-event";
import type { UniqueEntityId } from "./unique-entity-id";

export abstract class AggregateRoot<Props> extends Entity<Props> {
  private _domainEvents: DomainEvent[] = [];

  protected constructor(props: Props, id: UniqueEntityId) {
    super(props, id);
  }

  get domainEvents(): readonly DomainEvent[] {
    return this._domainEvents;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }
}
