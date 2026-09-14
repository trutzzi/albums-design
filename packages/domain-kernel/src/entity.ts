import type { UniqueEntityId } from "./unique-entity-id";

export abstract class Entity<Props> {
  protected readonly props: Props;
  private readonly _id: UniqueEntityId;

  protected constructor(props: Props, id: UniqueEntityId) {
    this.props = props;
    this._id = id;
  }

  get id(): UniqueEntityId {
    return this._id;
  }

  equals(other: Entity<Props> | undefined): boolean {
    if (other === undefined) return false;
    if (other === this) return true;
    return this._id.equals(other._id);
  }
}
