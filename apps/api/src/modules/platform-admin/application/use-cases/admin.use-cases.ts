import { readFile } from "node:fs/promises";
import os from "node:os";
import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { NotFoundError, ValidationError, type ApplicationError } from "#src/shared-kernel/errors";
import type { EmailSender } from "#src/shared-kernel/email";
import { consoleLogger, type Logger } from "#src/shared-kernel/logger";
import type {
  StudioMemberRepository,
  StudioRepository,
  SubscriptionRepository,
} from "#src/modules/identity/domain/repositories";
import { PLANS, type PlanCode } from "#src/modules/identity/domain/plan";
import type { Subscription } from "#src/modules/identity/domain/subscription";
import type { Studio } from "#src/modules/identity/domain/studio";
import type { ProjectRepository } from "#src/modules/media-ingestion/domain/project-repository";
import { computeBusinessStats, type BusinessStats } from "../../domain/business-stats";
import { Feedback, type FeedbackKind, type FeedbackRepository, type FeedbackStatus } from "../../domain/feedback";
import type { DependencyProbe, StatsSource } from "../ports/stats-source";
import type { HttpStats, RequestMetrics } from "#src/interface/request-metrics";
import type { StorageProvider } from "#src/shared-kernel/storage-provider";

/** The long-term store's space, or why it could not be read. `null`: no long-term store. */
export type StorageSpace =
  | { provider: string; usedBytes: number; totalBytes: number | null; checkedAt: string }
  | { provider: string; error: string; checkedAt: string }
  | null;

/** The provider's space changes slowly and asking costs an external call: once per five minutes is plenty. */
const STORAGE_SPACE_TTL_MS = 5 * 60 * 1000;

/**
 * Who may open the admin dashboard: the people who run AlbumFlow, listed by email in
 * ADMIN_EMAILS. It is a platform role, deliberately separate from a studio's own
 * OWNER/EDITOR roles — owning a studio never makes someone an admin of everyone's.
 */
export class AdminAccess {
  private readonly emails: Set<string>;

  constructor(
    private readonly members: StudioMemberRepository,
    adminEmails: string[],
  ) {
    this.emails = new Set(adminEmails.map((email) => email.trim().toLowerCase()).filter(Boolean));
  }

  /** Only a signed-in person can be an admin; the studio-wide API key never is. */
  async isAdmin(memberId: string | undefined): Promise<boolean> {
    if (!memberId || this.emails.size === 0) return false;
    const member = await this.members.findById(UniqueEntityId.create(memberId));
    return member !== undefined && this.emails.has(member.email.toLowerCase());
  }

  get adminEmails(): string[] {
    return [...this.emails];
  }
}

export interface FeedbackView {
  id: string;
  studioId: string;
  studioName: string | undefined;
  authorName: string;
  authorEmail: string;
  kind: FeedbackKind;
  message: string;
  rating: number | null;
  page: string | null;
  userAgent: string | null;
  status: FeedbackStatus;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

export class FeedbackUseCase {
  constructor(
    private readonly feedback: FeedbackRepository,
    private readonly members: StudioMemberRepository,
    private readonly studios: StudioRepository,
    private readonly access: AdminAccess,
    private readonly email: EmailSender,
    private readonly webOrigin: string,
    private readonly logger: Logger = consoleLogger,
  ) {}

  async submit(params: {
    studioId: string;
    memberId: string | undefined;
    kind: FeedbackKind;
    message: string;
    rating?: number | undefined;
    page?: string | undefined;
    userAgent?: string | undefined;
  }): Promise<Result<{ id: string }, ApplicationError>> {
    const member = params.memberId ? await this.members.findById(UniqueEntityId.create(params.memberId)) : undefined;
    const studio = await this.studios.findById(UniqueEntityId.create(params.studioId));
    if (!studio) return Result.failure(new NotFoundError("Studio", params.studioId));

    let item: Feedback;
    try {
      item = Feedback.submit({
        studioId: params.studioId,
        memberId: member?.id.toString(),
        authorName: member?.name ?? studio.name,
        authorEmail: member?.email ?? studio.ownerEmail,
        kind: params.kind,
        message: params.message,
        rating: params.rating,
        page: params.page?.slice(0, 512),
        userAgent: params.userAgent?.slice(0, 512),
      });
    } catch (error) {
      return Result.failure(new ValidationError(error instanceof Error ? error.message : "Invalid feedback."));
    }
    await this.feedback.save(item);
    // Telling us is the point; a mail hiccup must never lose the feedback or fail the request.
    await this.notifyAdmins(item, studio.name).catch((error: unknown) =>
      this.logger.error("could not email admins about new feedback", { feedbackId: item.id.toString(), err: error }),
    );
    return Result.success({ id: item.id.toString() });
  }

  async list(filter: {
    status?: FeedbackStatus | undefined;
    kind?: FeedbackKind | undefined;
  }): Promise<FeedbackView[]> {
    const items = await this.feedback.list({ ...filter, limit: 200 });
    const names = new Map<string, string | undefined>();
    for (const studioId of new Set(items.map((item) => item.snapshot.studioId))) {
      names.set(studioId, (await this.studios.findById(UniqueEntityId.create(studioId)))?.name);
    }
    return items.map((item) => toView(item, names.get(item.snapshot.studioId)));
  }

  async triage(
    id: string,
    change: { status?: FeedbackStatus | undefined; adminNote?: string | undefined },
  ): Promise<Result<FeedbackView, ApplicationError>> {
    const item = await this.feedback.findById(id);
    if (!item) return Result.failure(new NotFoundError("Feedback", id));
    item.triage(change);
    await this.feedback.save(item);
    const studio = await this.studios.findById(UniqueEntityId.create(item.snapshot.studioId));
    return Result.success(toView(item, studio?.name));
  }

  private async notifyAdmins(item: Feedback, studioName: string): Promise<void> {
    const to = this.access.adminEmails;
    if (to.length === 0) return;
    const { kind, message, rating, authorName, authorEmail, page } = item.snapshot;
    await this.email.send({
      to,
      replyTo: authorEmail,
      subject: `[AlbumFlow feedback] ${kind.toLowerCase()} from ${studioName}`,
      text: [
        `${authorName} <${authorEmail}> — ${studioName}`,
        rating ? `Rating: ${rating}/5` : "",
        page ? `Page: ${page}` : "",
        "",
        message,
        "",
        `Open the inbox: ${this.webOrigin.replace(/\/$/, "")}/admin?tab=feedback`,
      ]
        .filter((line, index) => line !== "" || index > 2)
        .join("\n"),
    });
  }
}

function toView(item: Feedback, studioName: string | undefined): FeedbackView {
  const props = item.snapshot;
  return {
    id: item.id.toString(),
    studioId: props.studioId,
    studioName,
    authorName: props.authorName,
    authorEmail: props.authorEmail,
    kind: props.kind,
    message: props.message,
    rating: props.rating ?? null,
    page: props.page ?? null,
    userAgent: props.userAgent ?? null,
    status: props.status,
    adminNote: props.adminNote,
    createdAt: props.createdAt.toISOString(),
    updatedAt: props.updatedAt.toISOString(),
  };
}

export interface StudioPlanView {
  studioId: string;
  name: string;
  ownerEmail: string;
  createdAt: string;
  planCode: PlanCode | null;
  status: string | null;
  albumsUsed: number;
  /** `null` means unlimited. */
  albumsIncluded: number | null;
  periodEnd: string | null;
  /** Whether the owner opened their confirmation link; `null` when unknown. */
  emailConfirmed: boolean | null;
  shoots: number | null;
}

export interface StudioPage {
  studios: StudioPlanView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Plans are an admin decision: every studio starts on Starter, and only the people who
 * run AlbumFlow move a studio to another plan (after payment is arranged with them).
 */
export class StudioPlansUseCase {
  constructor(
    private readonly studios: StudioRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly members?: StudioMemberRepository,
    private readonly projects?: ProjectRepository,
  ) {}

  /** One page at a time: a flood of signups must never make the admin page load them all. */
  async list(query: { page: number; pageSize: number; search?: string | undefined }): Promise<StudioPage> {
    const page = Math.max(1, query.page);
    const { studios, total } = await this.studios.listPage({
      search: query.search,
      offset: (page - 1) * query.pageSize,
      limit: query.pageSize,
    });
    const views = await Promise.all(
      studios.map(async (studio) => {
        const [subscription, owner, shoots] = await Promise.all([
          this.subscriptions.findByStudioId(studio.id),
          this.members?.findByEmail(studio.ownerEmail.toLowerCase()),
          this.projects?.listByStudioId(studio.id),
        ]);
        return {
          ...toStudioPlanView(studio, subscription),
          emailConfirmed: owner ? owner.emailVerified || !owner.passwordHash : null,
          shoots: shoots ? shoots.length : null,
        };
      }),
    );
    return { studios: views, total, page, pageSize: query.pageSize };
  }

  async assign(studioId: string, planCode: PlanCode): Promise<Result<StudioPlanView, ApplicationError>> {
    if (!PLANS[planCode]) return Result.failure(new ValidationError(`Unknown plan ${planCode}.`));
    const id = UniqueEntityId.create(studioId);
    const [studio, subscription] = await Promise.all([
      this.studios.findById(id),
      this.subscriptions.findByStudioId(id),
    ]);
    if (!studio || !subscription) return Result.failure(new NotFoundError("Studio", studioId));
    subscription.assignPlan(planCode);
    await this.subscriptions.save(subscription);
    return Result.success({ ...toStudioPlanView(studio, subscription), emailConfirmed: null, shoots: null });
  }
}

function toStudioPlanView(
  studio: Studio,
  subscription: Subscription | undefined,
): Omit<StudioPlanView, "emailConfirmed" | "shoots"> {
  return {
    studioId: studio.id.toString(),
    name: studio.name,
    ownerEmail: studio.ownerEmail,
    createdAt: studio.createdAt.toISOString(),
    planCode: subscription?.planCode ?? null,
    status: subscription?.status ?? null,
    albumsUsed: subscription?.albumsUsed ?? 0,
    albumsIncluded:
      subscription && Number.isFinite(subscription.plan.albumsPerPeriod) ? subscription.plan.albumsPerPeriod : null,
    periodEnd: subscription?.periodEnd.toISOString() ?? null,
  };
}

export interface SystemStats {
  generatedAt: string;
  process: {
    uptimeSeconds: number;
    nodeVersion: string;
    memoryMb: { rss: number; heapUsed: number; heapTotal: number };
    loadAverage: [number, number, number];
    cpus: number;
    /**
     * `available` is the kernel's MemAvailable (free plus reclaimable cache) on Linux, and
     * `null` elsewhere. os.freemem() leaves the cache out, so it reads near 100% used on a
     * perfectly healthy server and cannot be alarmed on.
     */
    hostMemoryMb: { total: number; available: number | null };
  };
  dependencies: {
    database: { ok: boolean; latencyMs: number | null };
    queues: Awaited<ReturnType<DependencyProbe["queues"]>>;
  };
  config: {
    mode: "production" | "demo";
    storage: string;
    email: string;
    billing: string;
    vision: string;
    errorMonitoring: boolean;
  };
  storageSpace: StorageSpace;
  http: HttpStats;
}

export class AdminDashboardUseCase {
  constructor(
    private readonly stats: StatsSource,
    private readonly feedback: FeedbackRepository,
    private readonly probe: DependencyProbe,
    private readonly metrics: RequestMetrics,
    private readonly config: SystemStats["config"],
    private readonly permanentStorage?: StorageProvider | undefined,
    private readonly now: () => number = Date.now,
  ) {}

  private spaceCache: { at: number; value: StorageSpace } | undefined;

  private async storageSpace(): Promise<StorageSpace> {
    const provider = this.permanentStorage;
    if (!provider?.usage) return null;
    if (this.spaceCache && this.now() - this.spaceCache.at < STORAGE_SPACE_TTL_MS) return this.spaceCache.value;
    const checkedAt = new Date(this.now()).toISOString();
    let value: StorageSpace;
    try {
      const usage = await provider.usage();
      value = { provider: provider.id, ...usage, checkedAt };
    } catch (error) {
      value = { provider: provider.id, error: error instanceof Error ? error.message : String(error), checkedAt };
    }
    this.spaceCache = { at: this.now(), value };
    return value;
  }

  async business(
    now: Date = new Date(),
  ): Promise<BusinessStats & { feedback: Awaited<ReturnType<FeedbackRepository["summary"]>> }> {
    const [input, feedback] = await Promise.all([
      this.stats.load(),
      this.feedback.summary(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
    ]);
    return { ...computeBusinessStats(input, now), feedback };
  }

  async system(): Promise<SystemStats> {
    const [latency, queues, storageSpace] = await Promise.all([
      this.probe.databaseLatencyMs(),
      this.probe.queues().catch(() => []),
      this.storageSpace(),
    ]);
    const memory = process.memoryUsage();
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
    const [one, five, fifteen] = os.loadavg();
    return {
      generatedAt: new Date().toISOString(),
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        memoryMb: { rss: mb(memory.rss), heapUsed: mb(memory.heapUsed), heapTotal: mb(memory.heapTotal) },
        loadAverage: [round(one), round(five), round(fifteen)],
        cpus: os.cpus().length,
        hostMemoryMb: { total: mb(os.totalmem()), available: await availableMemoryMb() },
      },
      dependencies: { database: { ok: latency !== null, latencyMs: latency }, queues },
      config: this.config,
      storageSpace,
      http: this.metrics.snapshot(),
    };
  }
}

async function availableMemoryMb(): Promise<number | null> {
  try {
    const match = /^MemAvailable:\s+(\d+) kB/m.exec(await readFile("/proc/meminfo", "utf8"));
    return match ? Math.round(Number(match[1]) / 1024) : null;
  } catch {
    return null;
  }
}

function round(value: number | undefined): number {
  return Math.round((value ?? 0) * 100) / 100;
}
