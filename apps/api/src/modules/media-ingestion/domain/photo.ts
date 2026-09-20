import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";
import { StorageKey } from "./value-objects/storage-key";
import { PhotoUploaded } from "./events/photo-uploaded";

export type PhotoStatus =
  | "PENDING_UPLOAD"
  | "UPLOADED"
  | "ANALYSIS_QUEUED"
  | "ANALYSED"
  | "FAILED";

export interface PhotoProps {
  projectId: UniqueEntityId;
  fileName: string;
  mimeType: string;
  storageKey: StorageKey;
  byteSize: number;
  status: PhotoStatus;
  checksum: string | undefined;
  createdAt: Date;
  uploadedAt: Date | undefined;
  /** Whether the small display copies have been written beside the original. */
  hasDerivatives: boolean;
  /** True when those display copies live on the long-term provider rather than beside the original. */
  permanentDerivatives: boolean;
  /** First time this photo was placed on an approved/exported album — i.e. chosen. */
  selectedAt: Date | undefined;
  /** When the full-resolution original was copied to long-term storage. */
  fullResStoredAt: Date | undefined;
  /** When the temporary (staging) copy of the original was deleted. */
  stagedOriginalPurgedAt: Date | undefined;
}

export class InvalidPhotoStateTransitionError extends Error {
  constructor(from: PhotoStatus, to: PhotoStatus) {
    super(`Cannot move a photo from ${from} to ${to}.`);
    this.name = "InvalidPhotoStateTransitionError";
  }
}

export class Photo extends AggregateRoot<PhotoProps> {
  private constructor(props: PhotoProps, id: UniqueEntityId) {
    super(props, id);
  }

  static requestUpload(
    params: {
      projectId: UniqueEntityId;
      studioId: UniqueEntityId;
      fileName: string;
      mimeType: string;
      byteSize: number;
    },
    id?: UniqueEntityId,
  ): Photo {
    const photoId = id ?? UniqueEntityId.create();
    const storageKey = StorageKey.forOriginal({
      studioId: params.studioId,
      projectId: params.projectId,
      photoId,
      fileName: params.fileName,
    });
    return new Photo(
      {
        projectId: params.projectId,
        fileName: params.fileName,
        mimeType: params.mimeType,
        storageKey,
        byteSize: params.byteSize,
        status: "PENDING_UPLOAD",
        checksum: undefined,
        createdAt: new Date(),
        uploadedAt: undefined,
        hasDerivatives: false,
        permanentDerivatives: false,
        selectedAt: undefined,
        fullResStoredAt: undefined,
        stagedOriginalPurgedAt: undefined,
      },
      photoId,
    );
  }

  static reconstitute(props: PhotoProps, id: UniqueEntityId): Photo {
    return new Photo(props, id);
  }

  markUploaded(params: { byteSize: number; checksum?: string | undefined; uploadedAt?: Date | undefined }): void {
    if (this.props.status !== "PENDING_UPLOAD") {
      throw new InvalidPhotoStateTransitionError(this.props.status, "UPLOADED");
    }
    this.props.status = "UPLOADED";
    this.props.byteSize = params.byteSize;
    this.props.checksum = params.checksum;
    this.props.uploadedAt = params.uploadedAt ?? new Date();
    this.addDomainEvent(new PhotoUploaded(this.id, this.props.projectId));
  }

  markAnalysisQueued(): void {
    if (this.props.status !== "UPLOADED") {
      throw new InvalidPhotoStateTransitionError(this.props.status, "ANALYSIS_QUEUED");
    }
    this.props.status = "ANALYSIS_QUEUED";
  }

  markAnalysed(): void {
    // Re-analysis of an already-analysed photo is legitimate, so this is idempotent.
    if (this.props.status !== "ANALYSIS_QUEUED" && this.props.status !== "ANALYSED") {
      throw new InvalidPhotoStateTransitionError(this.props.status, "ANALYSED");
    }
    this.props.status = "ANALYSED";
  }

  /**
   * Idempotent: regenerating derivatives for a photo that already has them is a
   * legitimate repair, not a state error.
   */
  markDerivativesReady(options: { permanent?: boolean } = {}): void {
    this.props.hasDerivatives = true;
    if (options.permanent) this.props.permanentDerivatives = true;
  }

  markSelected(at: Date): void {
    this.props.selectedAt ??= at;
  }

  markFullResStored(at: Date): void {
    this.props.fullResStoredAt = at;
  }

  markStagedOriginalPurged(at: Date): void {
    this.props.stagedOriginalPurgedAt = at;
  }

  markFailed(): void {
    this.props.status = "FAILED";
  }

  get projectId(): UniqueEntityId {
    return this.props.projectId;
  }

  get fileName(): string {
    return this.props.fileName;
  }

  get mimeType(): string {
    return this.props.mimeType;
  }

  get storageKey(): StorageKey {
    return this.props.storageKey;
  }

  get byteSize(): number {
    return this.props.byteSize;
  }

  get status(): PhotoStatus {
    return this.props.status;
  }

  get checksum(): string | undefined {
    return this.props.checksum;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get uploadedAt(): Date | undefined {
    return this.props.uploadedAt;
  }

  get hasDerivatives(): boolean {
    return this.props.hasDerivatives;
  }

  get permanentDerivatives(): boolean {
    return this.props.permanentDerivatives;
  }

  get selectedAt(): Date | undefined {
    return this.props.selectedAt;
  }

  get fullResStoredAt(): Date | undefined {
    return this.props.fullResStoredAt;
  }

  get stagedOriginalPurgedAt(): Date | undefined {
    return this.props.stagedOriginalPurgedAt;
  }
}
