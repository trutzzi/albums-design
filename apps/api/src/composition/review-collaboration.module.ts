import { SecretBox } from "../shared-kernel/secret-box";
import { ClientGrantSigner } from "../shared-kernel/client-grant";
import { ListProjectPhotosUseCase } from "../modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import { ClientAccessService } from "../modules/review-collaboration/application/services/client-access.service";
import { ClientInvitationMailer } from "../modules/review-collaboration/application/services/client-invitation.mailer";
import { ClientLinkInvitations } from "../modules/review-collaboration/application/services/client-link-invitations";
import { StudioEmailNotifier } from "../modules/review-collaboration/application/services/studio-email-notifier";
import { ClientConfirmationMailer } from "../modules/review-collaboration/application/services/client-confirmation.mailer";
import { OpenReviewSessionUseCase } from "../modules/review-collaboration/application/use-cases/open-review-session.use-case";
import { ReviewPortalUseCase } from "../modules/review-collaboration/application/use-cases/review-portal.use-case";
import { ReviewAccessUseCase } from "../modules/review-collaboration/application/use-cases/review-access.use-case";
import { AlbumFeedbackUseCase } from "../modules/review-collaboration/application/use-cases/album-feedback.use-case";
import { PickSessionAdminUseCase } from "../modules/review-collaboration/application/use-cases/open-pick-session.use-case";
import { PickPortalUseCase } from "../modules/review-collaboration/application/use-cases/pick-portal.use-case";
import { DownloadSessionAdminUseCase } from "../modules/review-collaboration/application/use-cases/download-session-admin.use-case";
import { DownloadPortalUseCase } from "../modules/review-collaboration/application/use-cases/download-portal.use-case";
import {
  AlbumCompositionGateway,
  LoggingReviewNotifier,
} from "../modules/review-collaboration/infrastructure/gateways/album-gateway";
import { StoragePhotoPreviewResolver } from "../modules/review-collaboration/infrastructure/gateways/photo-preview-resolver";
import {
  LoggingPickNotifier,
  MediaIngestionPickGateway,
} from "../modules/review-collaboration/infrastructure/gateways/pick-gateway";
import {
  CompositePickNotifier,
  CompositeReviewNotifier,
  IdentityStudioContacts,
  MediaIngestionDeliveryGateway,
} from "../modules/review-collaboration/infrastructure/gateways/delivery-gateway";
import { ProjectClientContactDirectory } from "../modules/review-collaboration/infrastructure/gateways/client-contact-gateway";
import { PromoteOnApprovalNotifier } from "../modules/review-collaboration/infrastructure/gateways/promote-on-approval-notifier";
import { PromoteOnPickNotifier } from "../modules/review-collaboration/infrastructure/gateways/promote-on-pick-notifier";
import type { ModuleInfrastructure, Repositories } from "./ports";
import type { IdentityModule } from "./identity.module";
import type { PhotoIntelligenceModule } from "./photo-intelligence.module";

/** Review & collaboration: the three client links — album review, photo picks, and delivery. */
export function buildReviewCollaborationModule(
  { env, logger, emailSender, storage, jobQueue, permanentStorage }: ModuleInfrastructure,
  repos: Repositories,
  {
    planFeatures,
    studioBranding,
    photoFocus,
    photoDimensions,
  }: Pick<IdentityModule, "planFeatures" | "studioBranding"> &
    Pick<PhotoIntelligenceModule, "photoFocus" | "photoDimensions">,
) {
  const { projects, photos, albums, members, studios, reviewSessions, pickSessions, downloadSessions } = repos;
  const reviewLog = logger.child({ component: "review" });
  const pickLog = logger.child({ component: "picks" });

  const studioContacts = new IdentityStudioContacts(projects, members, studios);
  // Client invitations: the photographer's own "here is your link" email, for all three
  // link kinds, plus the shoot's client contact they prefill from.
  const clientContacts = new ProjectClientContactDirectory(projects, albums);
  const invitations = new ClientLinkInvitations(
    new ClientInvitationMailer(emailSender),
    clientContacts,
    studioContacts,
    env.WEB_ORIGIN,
    logger.child({ component: "client-invitations" }),
    studioBranding,
  );
  // Passwords for client links (album review and download): generated per link, checked
  // against a hash, and kept encrypted so the studio can look the link + password up again.
  const clientAccess = new ClientAccessService(new SecretBox(env.JWT_SECRET), new ClientGrantSigner(env.JWT_SECRET));

  // Album review.
  const reviewAlbumGateway = new AlbumCompositionGateway(
    albums,
    new StoragePhotoPreviewResolver(photos, storage, permanentStorage),
    planFeatures,
    photoFocus,
    studioBranding,
  );
  // Email the studio's owners when a client sends picks, decides on a proof or finishes a
  // download — and confirm to the client that their picks or verdict arrived.
  const studioEmail = new StudioEmailNotifier(
    emailSender,
    studioContacts,
    env.WEB_ORIGIN,
    logger.child({ component: "studio-email" }),
    clientContacts,
  );
  const clientEmail = new ClientConfirmationMailer(
    emailSender,
    clientContacts,
    studioContacts,
    logger.child({ component: "client-email" }),
    studioBranding,
  );
  const decided = new CompositeReviewNotifier(
    [new LoggingReviewNotifier(reviewLog), studioEmail, clientEmail],
    reviewLog,
  );
  const reviewNotifier = permanentStorage ? new PromoteOnApprovalNotifier(decided, jobQueue, reviewLog) : decided;

  // Client photo selection ("picks"), the step before an album exists.
  const pickGateway = new MediaIngestionPickGateway(
    projects,
    photos,
    new ListProjectPhotosUseCase(photos, storage, permanentStorage),
    // The pick page shows the studio's branding too, when its plan includes it.
    { branding: studioBranding, dimensions: photoDimensions },
  );
  const loggedAndEmailed = new CompositePickNotifier(
    [new LoggingPickNotifier(pickLog), studioEmail, clientEmail],
    pickLog,
  );

  // Client delivery: a time-limited link that downloads every original as one ZIP.
  const deliveryGateway = new MediaIngestionDeliveryGateway(
    projects,
    photos,
    storage,
    permanentStorage,
    studioBranding,
  );

  return {
    openReviewSession: new OpenReviewSessionUseCase(
      reviewSessions,
      reviewAlbumGateway,
      clientAccess,
      invitations,
      clientContacts,
    ),
    reviewAccess: new ReviewAccessUseCase(reviewSessions, clientAccess, invitations, clientContacts),
    albumFeedback: new AlbumFeedbackUseCase(reviewSessions),
    reviewPortal: new ReviewPortalUseCase(reviewSessions, reviewAlbumGateway, reviewNotifier, clientAccess),
    pickAdmin: new PickSessionAdminUseCase(pickSessions, pickGateway, clientAccess, invitations, clientContacts),
    pickPortal: new PickPortalUseCase(
      pickSessions,
      pickGateway,
      permanentStorage ? new PromoteOnPickNotifier(loggedAndEmailed, jobQueue, pickLog) : loggedAndEmailed,
      clientAccess,
    ),
    downloadAdmin: new DownloadSessionAdminUseCase(
      downloadSessions,
      deliveryGateway,
      () => new Date(),
      clientAccess,
      invitations,
      clientContacts,
      planFeatures,
    ),
    downloadPortal: new DownloadPortalUseCase(
      downloadSessions,
      deliveryGateway,
      studioEmail,
      logger.child({ component: "download-portal" }),
      () => new Date(),
      clientAccess,
      pickGateway,
    ),
  };
}

export type ReviewCollaborationModule = ReturnType<typeof buildReviewCollaborationModule>;
