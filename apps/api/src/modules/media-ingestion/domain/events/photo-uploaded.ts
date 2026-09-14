import { DomainEvent, type UniqueEntityId } from "@albumflow/domain-kernel";

export class PhotoUploaded extends DomainEvent {
  readonly name = "media-ingestion.photo-uploaded";

  constructor(
    readonly aggregateId: UniqueEntityId,
    readonly projectId: UniqueEntityId,
  ) {
    super();
  }
}
