import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Photo } from "../modules/media-ingestion/domain/photo";
import type { PhotoRepository } from "../modules/media-ingestion/domain/photo-repository";
import type { Project } from "../modules/media-ingestion/domain/project";
import type { ProjectRepository } from "../modules/media-ingestion/domain/project-repository";
import type {
  ObjectHead,
  ObjectStorageWithBody,
  PresignedUpload,
} from "../modules/media-ingestion/application/ports/object-storage";
import type { JobQueue } from "../shared-kernel/job-queue";
import type { PhotoAnalysis } from "../modules/photo-intelligence/domain/photo-analysis";
import type { PhotoAnalysisRepository } from "../modules/photo-intelligence/domain/photo-analysis-repository";
import type { PhotoByteSource } from "../modules/photo-intelligence/application/ports/photo-source";
import type { Album } from "../modules/album-composition/domain/album";
import type { AlbumRepository } from "../modules/album-composition/domain/album-repository";
import type { ReviewSession } from "../modules/review-collaboration/domain/review-session";
import type { ReviewSessionRepository } from "../modules/review-collaboration/domain/review-session-repository";
import type { ExportJob } from "../modules/export-print/domain/export-job";
import type { ExportJobRepository } from "../modules/export-print/domain/export-job-repository";
import type { ExportStorage } from "../modules/export-print/application/ports/album-pdf-renderer";
import type {
  StudioMemberRepository,
  StudioRepository,
  SubscriptionRepository,
} from "../modules/identity/domain/repositories";
import type { Studio } from "../modules/identity/domain/studio";
import type { StudioMember } from "../modules/identity/domain/studio-member";
import type { Subscription } from "../modules/identity/domain/subscription";

export class InMemoryProjectRepository implements ProjectRepository {
  readonly items = new Map<string, Project>();
  async save(project: Project) {
    this.items.set(project.id.toString(), project);
  }
  async findById(id: UniqueEntityId) {
    return this.items.get(id.toString());
  }
  async listByStudioId(studioId: UniqueEntityId) {
    return [...this.items.values()].filter(
      (project) => project.studioId.toString() === studioId.toString(),
    );
  }
}

export class InMemoryPhotoRepository implements PhotoRepository {
  readonly items = new Map<string, Photo>();
  async save(photo: Photo) {
    this.items.set(photo.id.toString(), photo);
  }
  async findById(id: UniqueEntityId) {
    return this.items.get(id.toString());
  }
  async findByProjectId(projectId: UniqueEntityId) {
    return [...this.items.values()].filter(
      (photo) => photo.projectId.toString() === projectId.toString(),
    );
  }
}

export class InMemoryObjectStorage
  implements ObjectStorageWithBody, PhotoByteSource, ExportStorage
{
  readonly objects = new Map<string, Uint8Array>();

  async presignPut(params: { key: string; expiresInSeconds: number }): Promise<PresignedUpload> {
    return { url: `memory://${params.key}`, expiresInSeconds: params.expiresInSeconds };
  }
  async headObject(key: string): Promise<ObjectHead | undefined> {
    const data = this.objects.get(key);
    return data ? { byteSize: data.byteLength, etag: `"${data.byteLength}"` } : undefined;
  }
  async read(key: string): Promise<Uint8Array> {
    const data = this.objects.get(key);
    if (!data) throw new Error(`No object at ${key}`);
    return data;
  }
  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.objects.set(key, bytes);
  }
  async presignGet(key: string): Promise<string> {
    return `memory://${key}`;
  }
  async getObject(key: string): Promise<Buffer> {
    return Buffer.from(await this.read(key));
  }
  async putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void> {
    this.objects.set(params.key, new Uint8Array(params.body));
  }
  /** Simulates the browser completing its PUT to the presigned URL. */
  upload(key: string, bytes: Uint8Array): void {
    this.objects.set(key, bytes);
  }
}

export interface RecordedJob {
  queue: string;
  name: string;
  payload: Record<string, unknown>;
}

export class InMemoryJobQueue implements JobQueue {
  readonly jobs: RecordedJob[] = [];
  async enqueue(queue: string, name: string, payload: Record<string, unknown>) {
    this.jobs.push({ queue, name, payload });
  }
  drain(queue: string): RecordedJob[] {
    const matching = this.jobs.filter((job) => job.queue === queue);
    return matching;
  }
}

export class InMemoryPhotoAnalysisRepository implements PhotoAnalysisRepository {
  readonly items = new Map<string, PhotoAnalysis>();
  async save(analysis: PhotoAnalysis) {
    this.items.set(analysis.photoId.toString(), analysis);
  }
  async findByPhotoId(photoId: UniqueEntityId) {
    return this.items.get(photoId.toString());
  }
  async findByProjectId(projectId: UniqueEntityId) {
    return [...this.items.values()].filter(
      (analysis) => analysis.projectId.toString() === projectId.toString(),
    );
  }
}

export class InMemoryAlbumRepository implements AlbumRepository {
  readonly items = new Map<string, Album>();
  async save(album: Album) {
    this.items.set(album.id.toString(), album);
  }
  async findById(id: UniqueEntityId) {
    return this.items.get(id.toString());
  }
  async findByProjectId(projectId: UniqueEntityId) {
    return [...this.items.values()].filter(
      (album) => album.projectId.toString() === projectId.toString(),
    );
  }
  async countCreatedSince(_studioId: UniqueEntityId, since: Date) {
    return [...this.items.values()].filter((album) => album.createdAt >= since).length;
  }
}

export class InMemoryReviewSessionRepository implements ReviewSessionRepository {
  readonly items = new Map<string, ReviewSession>();
  async save(session: ReviewSession) {
    this.items.set(session.id.toString(), session);
  }
  async findById(id: UniqueEntityId) {
    return this.items.get(id.toString());
  }
  async findByTokenHash(tokenHash: string) {
    return [...this.items.values()].find((session) => session.tokenHash === tokenHash);
  }
  async findByAlbumId(albumId: UniqueEntityId) {
    return [...this.items.values()].filter(
      (session) => session.albumId.toString() === albumId.toString(),
    );
  }
}

export class InMemoryExportJobRepository implements ExportJobRepository {
  readonly items = new Map<string, ExportJob>();
  async save(job: ExportJob) {
    this.items.set(job.id.toString(), job);
  }
  async findById(id: UniqueEntityId) {
    return this.items.get(id.toString());
  }
  async findByAlbumId(albumId: UniqueEntityId) {
    return [...this.items.values()].filter(
      (job) => job.albumId.toString() === albumId.toString(),
    );
  }
}

export class InMemoryStudioRepository implements StudioRepository {
  readonly items = new Map<string, Studio>();
  async save(studio: Studio) {
    this.items.set(studio.id.toString(), studio);
  }
  async findById(id: UniqueEntityId) {
    return this.items.get(id.toString());
  }
  async findByApiKeyHash(hash: string) {
    return [...this.items.values()].find((studio) => studio.apiKeyHash === hash);
  }
}

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  readonly items = new Map<string, Subscription>();
  async save(subscription: Subscription) {
    this.items.set(subscription.studioId.toString(), subscription);
  }
  async findByStudioId(studioId: UniqueEntityId) {
    return this.items.get(studioId.toString());
  }
}

export class InMemoryStudioMemberRepository implements StudioMemberRepository {
  readonly items = new Map<string, StudioMember>();
  async save(member: StudioMember) {
    this.items.set(member.id.toString(), member);
  }
  async findById(id: UniqueEntityId) {
    return this.items.get(id.toString());
  }
  async listByStudioId(studioId: UniqueEntityId) {
    return [...this.items.values()].filter(
      (member) => member.studioId.toString() === studioId.toString(),
    );
  }
  async remove(id: UniqueEntityId) {
    this.items.delete(id.toString());
  }
}
