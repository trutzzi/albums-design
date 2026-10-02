import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  deleteProject,
  getProject,
  getStudioOverview,
  listDownloadSessions,
  listPickSessions,
  listPlans,
  listProjectAlbums,
  listProjectAnalyses,
  listProjectPhotos,
} from "@/shared/api";
import { useAuth } from "@/app/AuthContext";
import { GuidedTour, type TourStep } from "@/shared/ui/GuidedTour";
import { tip } from "@/shared/lib/tip";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { SHOOT_STEPS, shootWorkflow, type NextAction, type ShootStep } from "@/features/project/lib/shoot-workflow";
import { usePhotoUpload } from "@/features/project/hooks/usePhotoUpload";
import { useAlbumSize } from "@/features/project/hooks/useAlbumSize";
import { useClientContact } from "@/features/project/hooks/useClientContact";
import { PhotoUploader } from "@/features/project/components/PhotoUploader";
import { UploadProgress } from "@/features/project/components/UploadProgress";
import { DEFAULT_PHOTO_VIEW, PhotoBrowser, type PhotoView } from "@/features/project/components/PhotoBrowser";
import { SelectionPanel } from "@/features/project/components/SelectionPanel";
import { AlbumPanel } from "@/features/project/components/AlbumPanel";
import { DeliveryPanel } from "@/features/project/components/DeliveryPanel";

/** The guided tour points at the step tabs, since only the open step's content is on the page. */
const STEP_TOUR_TARGETS: Record<ShootStep, string | undefined> = {
  photos: undefined,
  selection: "project-picks",
  album: "project-generate",
  delivery: "project-delivery",
};

const PROJECT_TOUR: TourStep[] = [
  { target: '[data-tour="project-upload"]', titleKey: "tour.project.upload.title", bodyKey: "tour.project.upload.body" },
  { target: '[data-tour="project-photos"]', titleKey: "tour.project.photos.title", bodyKey: "tour.project.photos.body" },
  { target: '[data-tour="project-picks"]', titleKey: "tour.project.picks.title", bodyKey: "tour.project.picks.body" },
  { target: '[data-tour="project-generate"]', titleKey: "tour.project.generate.title", bodyKey: "tour.project.generate.body" },
  { target: '[data-tour="project-delivery"]', titleKey: "tour.project.delivery.title", bodyKey: "tour.project.delivery.body" },
];

/**
 * A shoot, as four step tabs — photos, client selection, album, delivery — under a hint
 * of what to do next. Each step is its own component; this page holds what they share:
 * the shoot's data, the upload, the album size and the client's contact.
 */
export function ProjectPage() {
  const { studioId } = useAuth();
  const { t } = useLanguage();
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Off by default: AI analysis costs real time (and, once a paid provider is
  // ever wired in, real money) that the free heuristic doesn't. Turning it on
  // requires reading and agreeing to a disclaimer first.
  const [useAi, setUseAi] = useState(false);
  const [photoView, setPhotoView] = useState<PhotoView>(DEFAULT_PHOTO_VIEW);

  // Which step is open lives in the URL, so a reload or the back button keeps the place.
  const [params, setParams] = useSearchParams();
  const requestedStep = params.get("step");
  const step: ShootStep = SHOOT_STEPS.includes(requestedStep as ShootStep) ? (requestedStep as ShootStep) : "photos";
  const goTo = useCallback(
    (next: ShootStep) =>
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          updated.set("step", next);
          return updated;
        },
        { replace: true },
      ),
    [setParams],
  );

  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => getProject(projectId) });

  // What the studio's plan allows here: photos per shoot, and client download links.
  const studio = useQuery({ queryKey: ["studio", studioId], queryFn: () => getStudioOverview(studioId) });
  const plans = useQuery({ queryKey: ["plans"], queryFn: listPlans, staleTime: Infinity });
  const plan = plans.data?.find((item) => item.code === studio.data?.subscription.planCode);
  const photoLimit = plan?.maxPhotosPerShoot ?? null;
  const canSendDownloadLinks = plan?.clientDownloadLinks ?? true;

  const photos = useQuery({
    queryKey: ["photos", projectId],
    queryFn: () => listProjectPhotos(projectId),
    refetchInterval: (query) =>
      query.state.data?.some((photo) => photo.status !== "ANALYSIS_QUEUED") ? 4000 : 15000,
  });
  const analyses = useQuery({
    queryKey: ["analyses", projectId],
    queryFn: () => listProjectAnalyses(projectId),
    refetchInterval: 5000,
  });
  // The panels read these same queries by key; the page needs them for the step statuses.
  const albums = useQuery({ queryKey: ["albums", projectId], queryFn: () => listProjectAlbums(projectId) });
  const pickSessions = useQuery({
    queryKey: ["pick-sessions", projectId],
    queryFn: () => listPickSessions(projectId),
    refetchInterval: 15000,
  });
  const downloadSessions = useQuery({
    queryKey: ["download-sessions", projectId],
    queryFn: () => listDownloadSessions(projectId),
    refetchInterval: 15000,
  });

  const uploadedCount = photos.data?.length ?? 0;
  const analysed = analyses.data?.length ?? 0;
  const albumWorthy = (analyses.data ?? []).filter((analysis) => analysis.albumWorthy).length;

  const upload = usePhotoUpload({ studioId, projectId, useAi, photoLimit, photoCount: uploadedCount });
  const albumSize = useAlbumSize();
  const contact = useClientContact(project.data);

  const removeProject = useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["project", projectId] });
      navigate("/");
    },
  });

  // Photos any client has sent as their picks, for the heart on the gallery.
  const clientPicked = useMemo(
    () =>
      new Set(
        (pickSessions.data ?? [])
          .filter((session) => session.status === "SUBMITTED")
          .flatMap((session) => session.pickedPhotoIds),
      ),
    [pickSessions.data],
  );

  const workflow = shootWorkflow({
    uploaded: uploadedCount,
    analysed,
    albums: albums.data ?? [],
    picks: pickSessions.data ?? [],
    deliveries: downloadSessions.data ?? [],
  });
  const runAction: Record<NextAction, () => void> = {
    addPhotos: () => inputRef.current?.click(),
    toSelection: () => goTo("selection"),
    toAlbum: () => goTo("album"),
    seePicks: () => goTo("selection"),
    toDelivery: () => goTo("delivery"),
    openAlbum: () => navigate(`/albums/${workflow.next.albumId}`),
  };

  return (
    <div className="page shoot">
      <GuidedTour id="project" steps={PROJECT_TOUR} ready={project.isSuccess} />
      <header className="page__header">
        <div>
          <Link to="/" className="muted back-link">
            {t("project.back")}
          </Link>
          <h1>{project.data?.name ?? t("common.loading")}</h1>
          <p className="muted">{t("project.stats", { uploaded: uploadedCount, analysed, albumWorthy })}</p>
        </div>
      </header>

      {/* Mounted on every step, so "Add photos" works from wherever the photographer is. */}
      <input
        id="photo-input"
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/tiff,image/webp"
        hidden
        onChange={(event) => upload.handleFiles(event.target.files)}
      />

      <nav className="steps" role="tablist" aria-label={t("project.steps.label")}>
        {SHOOT_STEPS.map((key, index) => {
          const info = workflow.steps[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`step-${key}`}
              aria-selected={step === key}
              aria-controls="step-panel"
              data-tour={STEP_TOUR_TARGETS[key]}
              className={`steps__tab ${step === key ? "steps__tab--on" : ""} ${info.done ? "steps__tab--done" : ""}`}
              onClick={() => goTo(key)}
            >
              <span className="steps__number" aria-hidden="true">
                {info.done ? "✓" : index + 1}
              </span>
              <span className="steps__text">
                <span className="steps__label">{t(`project.step.${key}`)}</span>
                <span className="steps__status">
                  {info.done && <span className="visually-hidden">{t("project.step.done")}: </span>}
                  {t(info.status.key, info.status.params)}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <section className="next-step" aria-live="polite">
        <div>
          <h2 className="next-step__title">{t("project.next.title")}</h2>
          <p className="next-step__text">{t(workflow.next.text.key, workflow.next.text.params)}</p>
        </div>
        {workflow.next.actions.length > 0 && (
          <div className="next-step__actions">
            {workflow.next.actions.map((action, index) => (
              <button
                key={action}
                type="button"
                className={`button ${index === 0 ? "button--primary" : ""}`}
                onClick={runAction[action]}
              >
                {t(`project.next.${action}`)}
              </button>
            ))}
          </div>
        )}
      </section>

      <div id="step-panel" role="tabpanel" aria-labelledby={`step-${step}`}>
        {step === "photos" && (
          <>
            <PhotoUploader
              upload={upload}
              inputRef={inputRef}
              useAi={useAi}
              onUseAiChange={setUseAi}
              photoCount={uploadedCount}
              photoLimit={photoLimit}
            />
            <PhotoBrowser
              photos={photos.data ?? []}
              analyses={analyses.data ?? []}
              clientPicked={clientPicked}
              view={photoView}
              onViewChange={setPhotoView}
            />
          </>
        )}
        {/* Hidden rather than unmounted: a freshly created link is shown only once, and a
            half-filled form should still be there after a look at another step. */}
        <div hidden={step !== "selection"}>
          <SelectionPanel projectId={projectId} contact={contact} albumFormat={albumSize.format} />
        </div>
        <div hidden={step !== "album"}>
          <AlbumPanel projectId={projectId} size={albumSize} analysed={analysed} />
        </div>
        <div hidden={step !== "delivery"}>
          <DeliveryPanel projectId={projectId} contact={contact} canSendDownloadLinks={canSendDownloadLinks} />
        </div>
      </div>

      <section className="danger-zone">
        <div>
          <h2>{t("project.danger.title")}</h2>
          <p className="muted">{t("project.danger.body")}</p>
        </div>
        <button
          type="button"
          className="button button--danger"
          onClick={() => {
            removeProject.reset();
            setConfirmingDelete(true);
          }}
          {...tip(t("tip.deleteShoot"))}
        >
          {t("project.deleteShoot")}
        </button>
      </section>

      {upload.batch && <UploadProgress batch={upload.batch} onCancel={upload.cancel} />}

      {confirmingDelete && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => !removeProject.isPending && setConfirmingDelete(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-project-title">{t("project.deleteShoot.title")}</h2>
            <p>{t("project.deleteShoot.body", { name: project.data?.name ?? "" })}</p>
            {removeProject.isError && <p className="error">{(removeProject.error as Error).message}</p>}
            <div className="modal__actions">
              <button
                type="button"
                className="button"
                disabled={removeProject.isPending}
                onClick={() => setConfirmingDelete(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={removeProject.isPending}
                onClick={() => removeProject.mutate()}
              >
                {removeProject.isPending ? t("project.deleteShoot.deleting") : t("project.deleteShoot.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
