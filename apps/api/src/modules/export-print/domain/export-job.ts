import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";

export type ExportStatus = "QUEUED" | "RENDERING" | "READY" | "FAILED";
/** A print PDF, or one JPG per spread in a ZIP for labs that only take images. */
export type ExportFormat = "PDF" | "JPG_ZIP";

export interface ExportJobProps {
  albumId: UniqueEntityId;
  printProfileId: string;
  /** Absent on exports made before formats existed: those are PDFs. */
  format?: ExportFormat | undefined;
  status: ExportStatus;
  storageKey: string | undefined;
  byteSize: number | undefined;
  pageCount: number | undefined;
  /** The page size the PDF was rendered at; unknown for exports made before sizes could change. */
  pageWidthMm?: number | undefined;
  pageHeightMm?: number | undefined;
  failureReason: string | undefined;
  requestedAt: Date;
  completedAt: Date | undefined;
}

export class ExportJob extends AggregateRoot<ExportJobProps> {
  private constructor(props: ExportJobProps, id: UniqueEntityId) {
    super(props, id);
  }

  static request(
    params: { albumId: UniqueEntityId; printProfileId: string; format?: ExportFormat | undefined },
    id?: UniqueEntityId,
  ): ExportJob {
    return new ExportJob(
      {
        albumId: params.albumId,
        printProfileId: params.printProfileId,
        format: params.format ?? "PDF",
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

  get format(): ExportFormat {
    return this.props.format ?? "PDF";
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

  get pageWidthMm(): number | undefined {
    return this.props.pageWidthMm;
  }

  get pageHeightMm(): number | undefined {
    return this.props.pageHeightMm;
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

  markReady(params: {
    storageKey: string;
    byteSize: number;
    pageCount: number;
    pageWidthMm: number;
    pageHeightMm: number;
  }): void {
    this.props.status = "READY";
    this.props.pageWidthMm = params.pageWidthMm;
    this.props.pageHeightMm = params.pageHeightMm;
    this.props.storageKey = params.storageKey;
    this.props.byteSize = params.byteSize;
    this.props.pageCount = params.pageCount;
    this.props.completedAt = new Date();
  }

  /** A failed export has no file: anything recorded for one on the way (then removed) goes too. */
  markFailed(reason: string): void {
    this.props.status = "FAILED";
    this.props.storageKey = undefined;
    this.props.byteSize = undefined;
    this.props.pageCount = undefined;
    this.props.pageWidthMm = undefined;
    this.props.pageHeightMm = undefined;
    this.props.failureReason = reason;
    this.props.completedAt = new Date();
  }
}
