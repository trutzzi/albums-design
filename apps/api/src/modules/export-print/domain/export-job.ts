import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";

export type ExportStatus = "QUEUED" | "RENDERING" | "READY" | "FAILED";

export interface ExportJobProps {
  albumId: UniqueEntityId;
  printProfileId: string;
  status: ExportStatus;
  storageKey: string | undefined;
  byteSize: number | undefined;
  pageCount: number | undefined;
  failureReason: string | undefined;
  requestedAt: Date;
  completedAt: Date | undefined;
}

export class ExportJob extends AggregateRoot<ExportJobProps> {
  private constructor(props: ExportJobProps, id: UniqueEntityId) {
    super(props, id);
  }

  static request(
    params: { albumId: UniqueEntityId; printProfileId: string },
    id?: UniqueEntityId,
  ): ExportJob {
    return new ExportJob(
      {
        albumId: params.albumId,
        printProfileId: params.printProfileId,
        status: "QUEUED",
        storageKey: undefined,
        byteSize: undefined,
        pageCount: undefined,
        failureReason: undefined,
        requestedAt: new Date(),
        completedAt: undefined,
      },
      id ?? UniqueEntityId.create(),
    );
  }

  static reconstitute(props: ExportJobProps, id: UniqueEntityId): ExportJob {
    return new ExportJob(props, id);
  }

  get albumId(): UniqueEntityId {
    return this.props.albumId;
  }

  get printProfileId(): string {
    return this.props.printProfileId;
  }

  get status(): ExportStatus {
    return this.props.status;
  }

  get storageKey(): string | undefined {
    return this.props.storageKey;
  }

  get byteSize(): number | undefined {
    return this.props.byteSize;
  }

  get pageCount(): number | undefined {
    return this.props.pageCount;
  }

  get failureReason(): string | undefined {
    return this.props.failureReason;
  }

  get requestedAt(): Date {
    return this.props.requestedAt;
  }

  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }

  markRendering(): void {
    this.props.status = "RENDERING";
  }

  markReady(params: { storageKey: string; byteSize: number; pageCount: number }): void {
    this.props.status = "READY";
    this.props.storageKey = params.storageKey;
    this.props.byteSize = params.byteSize;
    this.props.pageCount = params.pageCount;
    this.props.completedAt = new Date();
  }

  markFailed(reason: string): void {
    this.props.status = "FAILED";
    this.props.failureReason = reason;
    this.props.completedAt = new Date();
  }
}
