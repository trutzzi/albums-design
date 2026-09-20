import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runWithLimit, sortFilesByName } from "../../lib/upload-queue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { SUPPORTED_MIME_TYPES } from "@albumflow/contracts";
import {
  confirmUpload,
  deleteProject,
  getAiStatus,
  getProject,
  generateAlbum,
  getDownloadAccess,
  getPickAccess,
  sendDownloadInvitation,
  sendPickInvitation,
  listDownloadSessions,
  listPickSessions,
  openDownloadSession,
  revokeDownloadSession,
  openPickSession,
  reopenPickSession,
  revokePickSession,
  type PickSessionSummary,
  listProjectAlbums,
  listProjectAnalyses,
  listProjectPhotos,
  abandonUpload,
  putFileToStorage,
  requestUpload,
} from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { LanguagePrompt } from "../../components/LanguagePrompt";
import { AccessDetailsModal } from "../../components/AccessDetailsModal";
import {
  ALBUM_DIMENSIONS,
  DEFAULT_ALBUM_DIMENSION_ID,
  DEFAULT_BLEED_MM,
} from "../../lib/album-dimensions";

const CUSTOM_DIMENSION_ID = "custom";

type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];
const ACCEPTED = new Set<string>(["image/jpeg", "image/png", "image/tiff", "image/webp"]);

type TransferState = "uploading" | "confirming" | "done" | "error";
interface Transfer {
  key: string;
  fileName: string;
  state: TransferState;
  message?: string;
}

/** Uploads in flight at once. Enough to keep a fast connection busy, few enough to stay orderly. */
const UPLOAD_PARALLELISM = 6;

export function ProjectPage() {
  const { studioId } = useAuth();
  const { t, language, hasChosenLanguage } = useLanguage();
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  /** Present only while a batch is uploading — it also blocks the rest of the page. */
  const [upload, setUpload] = useState<{ total: number; done: number; failed: number; cancelling: boolean } | null>(
    null,
  );
  const uploadAbort = useRef<AbortController | null>(null);
  /** Photos created on the server whose upload has not been confirmed — what a cancel must clean up. */
  const unconfirmed = useRef(new Set<string>());
  const [isDragging, setDragging] = useState(false);
  const [targetSpreads, setTargetSpreads] = useState(10);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Asked once, the first time anyone generates an album, if the studio has
  // never explicitly picked a language — see LanguagePrompt.
  const [askingLanguage, setAskingLanguage] = useState(false);
  const [dimensionId, setDimensionId] = useState(DEFAULT_ALBUM_DIMENSION_ID);
  const [customWidthCm, setCustomWidthCm] = useState(25);
  const [customHeightCm, setCustomHeightCm] = useState(25);
  const [dimensionModalOpen, setDimensionModalOpen] = useState(false);
  // Off by default: AI analysis costs real time (and, once a paid provider is
  // ever wired in, real money) that the free heuristic doesn't. Turning it on
  // requires reading and agreeing to the disclaimer modal below first.
  const [useAi, setUseAi] = useState(false);
  const [aiConsentOpen, setAiConsentOpen] = useState(false);

  // Client photo selection: the link is shown once (only its hash is stored).
  const [pickClientName, setPickClientName] = useState("");
  const [pickLimit, setPickLimit] = useState("");
  const [pickLink, setPickLink] = useState<string | null>(null);
  const [pickLinkCopied, setPickLinkCopied] = useState(false);
  const [pickPassword, setPickPassword] = useState<string | null>(null);
  // One client per shoot: typed once, prefilled into every link form from here on.
  const [clientEmail, setClientEmail] = useState("");
  const [emailLanguage, setEmailLanguage] = useState<"en" | "ro">(language);
  const [pickSendEmail, setPickSendEmail] = useState(false);
  const [pickEmailNote, setPickEmailNote] = useState<{ sentTo?: string; error?: string } | null>(null);
  const [deliverySendEmail, setDeliverySendEmail] = useState(false);
  const [deliveryEmailNote, setDeliveryEmailNote] = useState<{ sentTo?: string; error?: string } | null>(null);
  const [pickDetailsFor, setPickDetailsFor] = useState<string | null>(null);

  // Client delivery: the link is shown once (only its hash is stored).
  const [deliveryClientName, setDeliveryClientName] = useState("");
  const [deliveryDays, setDeliveryDays] = useState("30");
  const [deliveryLink, setDeliveryLink] = useState<string | null>(null);
  const [deliveryMissing, setDeliveryMissing] = useState(0);
  const [deliveryCopied, setDeliveryCopied] = useState(false);
  const [deliveryPassword, setDeliveryPassword] = useState<string | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
  });

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

  const albums = useQuery({
    queryKey: ["albums", projectId],
    queryFn: () => listProjectAlbums(projectId),
  });

  // Polled independently of everything else on this page — a downed local AI
  // server never blocks uploads or generation (photo analysis quietly falls
  // back to the heuristic classifier), this is purely informational.
  const aiStatus = useQuery({
    queryKey: ["ai-status"],
    queryFn: getAiStatus,
    refetchInterval: 20000,
    retry: false,
  });

  const selectedDimension =
    dimensionId === CUSTOM_DIMENSION_ID
      ? { widthCm: customWidthCm, heightCm: customHeightCm }
      : (ALBUM_DIMENSIONS.find((option) => option.id === dimensionId) ?? ALBUM_DIMENSIONS[0]!);

  const generate = useMutation({
    mutationFn: () =>
      generateAlbum(projectId, {
        targetSpreads,
        format: {
          pageWidthMm: selectedDimension.widthCm * 10,
          pageHeightMm: selectedDimension.heightCm * 10,
          bleedMm: DEFAULT_BLEED_MM,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["albums", projectId] }),
  });

  const shootClientName = project.data?.clientName ?? "";
  const shootClientEmail = project.data?.clientEmail ?? "";
  // The shoot is the source of truth; the fields start from it and the photographer can edit.
  const effectiveClientEmail = clientEmail || shootClientEmail;

  const pickSessions = useQuery({
    queryKey: ["pick-sessions", projectId],
    queryFn: () => listPickSessions(projectId),
    refetchInterval: 15000,
  });
  const refreshPicks = () => queryClient.invalidateQueries({ queryKey: ["pick-sessions", projectId] });

  const createPickLink = useMutation({
    mutationFn: () =>
      openPickSession(projectId, {
        clientName: pickClientName.trim() || shootClientName || "Client",
        ...(Number(pickLimit) > 0 ? { pickLimit: Math.floor(Number(pickLimit)) } : {}),
        ...(effectiveClientEmail ? { clientEmail: effectiveClientEmail } : {}),
        ...(pickSendEmail ? { sendEmail: true, language: emailLanguage } : {}),
      }),
    onSuccess: (session) => {
      setPickEmailNote(
        session.emailSentTo ? { sentTo: session.emailSentTo } : session.emailError ? { error: session.emailError } : null,
      );
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setPickLink(`${window.location.origin}/pick/${session.token}`);
      setPickPassword(session.password ?? null);
      setPickLinkCopied(false);
      void refreshPicks();
    },
  });
  const reopenPick = useMutation({
    mutationFn: (sessionId: string) => reopenPickSession(projectId, sessionId),
    onSuccess: refreshPicks,
  });
  const revokePick = useMutation({
    mutationFn: (sessionId: string) => revokePickSession(projectId, sessionId),
    onSuccess: refreshPicks,
  });
  const buildFromPicks = useMutation({
    mutationFn: (session: PickSessionSummary) =>
      generateAlbum(projectId, {
        title: t("project.picks.buildTitle", { name: session.clientName }),
        // Sized from the picks themselves, not the spread-count field above.
        photoIds: session.pickedPhotoIds,
        format: {
          pageWidthMm: selectedDimension.widthCm * 10,
          pageHeightMm: selectedDimension.heightCm * 10,
          bleedMm: DEFAULT_BLEED_MM,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["albums", projectId] }),
  });

  // Photos any client has sent as their picks, for the heart on the grid below.
  const clientPicked = useMemo(
    () =>
      new Set(
        (pickSessions.data ?? [])
          .filter((session) => session.status === "SUBMITTED")
          .flatMap((session) => session.pickedPhotoIds),
      ),
    [pickSessions.data],
  );

  const downloadSessions = useQuery({
    queryKey: ["download-sessions", projectId],
    queryFn: () => listDownloadSessions(projectId),
    refetchInterval: 15000,
  });
  const refreshDownloads = () => queryClient.invalidateQueries({ queryKey: ["download-sessions", projectId] });
  const createDownloadLink = useMutation({
    mutationFn: () =>
      openDownloadSession(projectId, {
        clientName: deliveryClientName.trim() || shootClientName || "Client",
        ...(Number(deliveryDays) > 0 ? { ttlDays: Math.floor(Number(deliveryDays)) } : {}),
        ...(effectiveClientEmail ? { clientEmail: effectiveClientEmail } : {}),
        ...(deliverySendEmail ? { sendEmail: true, language: emailLanguage } : {}),
      }),
    onSuccess: (session) => {
      setDeliveryEmailNote(
        session.emailSentTo ? { sentTo: session.emailSentTo } : session.emailError ? { error: session.emailError } : null,
      );
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setDeliveryLink(`${window.location.origin}/download/${session.token}`);
      setDeliveryPassword(session.password ?? null);
      setDeliveryMissing(session.missingCount);
      setDeliveryCopied(false);
      void refreshDownloads();
    },
  });
  const revokeDownload = useMutation({
    mutationFn: (sessionId: string) => revokeDownloadSession(projectId, sessionId),
    onSuccess: refreshDownloads,
  });

  const removeProject = useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["project", projectId] });
      navigate("/");
    },
  });

  const analysisByPhoto = useMemo(
    () => new Map((analyses.data ?? []).map((analysis) => [analysis.photoId, analysis])),
    [analyses.data],
  );

  const updateTransfer = useCallback((key: string, patch: Partial<Transfer>) => {
    setTransfers((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }, []);

  const uploadOne = useCallback(
    async (file: File, signal?: AbortSignal) => {
      const key = `${file.name}-${file.lastModified}-${file.size}`;
      setTransfers((prev) => [...prev, { key, fileName: file.name, state: "uploading" }]);

      if (!ACCEPTED.has(file.type)) {
        updateTransfer(key, { state: "error", message: "Unsupported file type" });
        setUpload((current) => (current ? { ...current, failed: current.failed + 1 } : current));
        return;
      }

      try {
        const requested = await requestUpload(studioId, projectId, {
          fileName: file.name,
          mimeType: file.type as SupportedMimeType,
          byteSize: file.size,
        });
        // From here the server holds a row for this photo; until confirm-upload succeeds it is
        // an unfinished upload, and a cancel is responsible for clearing it.
        unconfirmed.current.add(requested.photoId);
        await putFileToStorage(requested.uploadUrl, file, signal);
        updateTransfer(key, { state: "confirming" });
        await confirmUpload(requested.photoId, { useAi });
        unconfirmed.current.delete(requested.photoId);
        updateTransfer(key, { state: "done" });
        setUpload((current) => (current ? { ...current, done: current.done + 1 } : current));
      } catch (error) {
        const cancelled = signal?.aborted === true;
        updateTransfer(key, {
          state: "error",
          message: cancelled
            ? t("project.upload.cancelledFile")
            : error instanceof Error
              ? error.message
              : "Upload failed",
        });
        if (!cancelled) setUpload((current) => (current ? { ...current, failed: current.failed + 1 } : current));
      }
    },
    [projectId, studioId, updateTransfer, useAi, t],
  );

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      // In file-name order, a few at a time — not all at once — so the shoot fills up in
      // order and a thousand photos do not open a thousand connections.
      const files = sortFilesByName(Array.from(fileList));
      const controller = new AbortController();
      uploadAbort.current = controller;
      unconfirmed.current = new Set();
      setUpload({ total: files.length, done: 0, failed: 0, cancelling: false });

      void runWithLimit(files, UPLOAD_PARALLELISM, (file) => uploadOne(file, controller.signal), controller.signal)
        .then(async () => {
          // Anything still unconfirmed here was cut off by a cancel: the rows exist on the
          // server but no photo does, so they are thrown away rather than left behind.
          const orphans = [...unconfirmed.current];
          unconfirmed.current = new Set();
          if (orphans.length > 0) {
            setUpload((current) => (current ? { ...current, cancelling: true } : current));
            await Promise.allSettled(orphans.map((photoId) => abandonUpload(photoId)));
          }
        })
        .finally(() => {
          uploadAbort.current = null;
          setUpload(null);
          void queryClient.invalidateQueries({ queryKey: ["photos", projectId] });
        });
    },
    [uploadOne, queryClient, projectId],
  );

  const cancelUpload = useCallback(() => {
    setUpload((current) => (current ? { ...current, cancelling: true } : current));
    uploadAbort.current?.abort();
  }, []);

  // A reload mid-batch would strand half-uploaded photos, so the browser asks first.
  useEffect(() => {
    if (!upload) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [upload]);

  const startGenerate = useCallback(() => {
    if (!hasChosenLanguage) {
      setAskingLanguage(true);
      return;
    }
    generate.mutate();
  }, [hasChosenLanguage, generate]);

  const analysed = analyses.data?.length ?? 0;
  const albumWorthy = (analyses.data ?? []).filter((analysis) => analysis.albumWorthy).length;
  const inFlight = transfers.filter((t) => t.state === "uploading" || t.state === "confirming");

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <Link to="/" className="muted back-link">
            {t("project.back")}
          </Link>
          <h1>{project.data?.name ?? t("common.loading")}</h1>
          <p className="muted">
            {t("project.stats", {
              uploaded: photos.data?.length ?? 0,
              analysed,
              albumWorthy,
            })}
          </p>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            removeProject.reset();
            setConfirmingDelete(true);
          }}
        >
          {t("project.deleteShoot")}
        </button>
      </header>

      <div className="ai-toggle-row">
        <label className="ruler-toggle">
          <input
            type="checkbox"
            className="ruler-toggle__input"
            checked={useAi}
            disabled={!aiStatus.data?.available}
            onChange={(event) => {
              if (event.target.checked) {
                setAiConsentOpen(true);
              } else {
                setUseAi(false);
              }
            }}
          />
          <span className="ruler-toggle__track" aria-hidden="true">
            <span className="ruler-toggle__thumb" />
          </span>
          {t("project.upload.useAi")}
        </label>
        <span
          className={`chip ai-status-chip chip--${aiStatus.data?.available ? "active" : "queued"}`}
          title={
            aiStatus.data?.available
              ? t("ai.status.online.title")
              : t("project.upload.useAi.unavailable")
          }
        >
          {aiStatus.data?.available ? t("ai.status.online") : t("ai.status.offline")}
        </span>
      </div>

      <section
        className={`dropzone ${isDragging ? "dropzone--active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <p className="dropzone__title">{t("project.dropzone.title")}</p>
        <p className="muted">{t("project.dropzone.subtitle")}</p>
        <input
          id="photo-input"
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/tiff,image/webp"
          hidden
          onChange={(event) => handleFiles(event.target.files)}
        />
      </section>

      {inFlight.length > 0 && (
        <p className="muted upload-status">
          {t("project.uploading", { count: inFlight.length, plural: inFlight.length === 1 ? "" : "s" })}
        </p>
      )}
      {transfers.some((t) => t.state === "error") && (
        <ul className="error-list">
          {transfers
            .filter((t) => t.state === "error")
            .map((t) => (
              <li key={t.key}>
                {t.fileName}: {t.message}
              </li>
            ))}
        </ul>
      )}

      <section className="panel">
        <div className="panel__head">
          <h2>{t("project.generate.title")}</h2>
          <div className="panel__actions">
            <label htmlFor="target-spreads" className="muted">
              {t("project.generate.targetSpreads")}
            </label>
            <input
              id="target-spreads"
              type="number"
              min={1}
              max={60}
              value={targetSpreads}
              onChange={(event) => setTargetSpreads(Number(event.target.value))}
            />
            <span className="muted">{t("project.generate.dimension")}</span>
            <button
              type="button"
              className="print-profile-chip"
              onClick={() => setDimensionModalOpen(true)}
            >
              {t("dimension.chip", {
                width: selectedDimension.widthCm,
                height: selectedDimension.heightCm,
              })}
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={generate.isPending || analysed === 0}
              onClick={startGenerate}
            >
              {generate.isPending ? t("project.generate.submitting") : t("project.generate.submit")}
            </button>
          </div>
        </div>
        {analysed === 0 && <p className="muted">{t("project.generate.waitingOnAnalysis")}</p>}
        {generate.isError && <p className="error">{(generate.error as Error).message}</p>}

        {albums.data && albums.data.length > 0 && (
          <ul className="album-list">
            {albums.data.map((album) => (
              <li key={album.id}>
                <div>
                  <Link to={`/albums/${album.id}`} className="album-list__title">
                    {album.title}
                  </Link>
                  <p className="muted">
                    {album.spreadCount} spreads · {album.pageCount} pages · {album.photoCount} photos
                  </p>
                </div>
                <span className={`chip chip--${album.status.toLowerCase()}`}>{album.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>{t("project.picks.title")}</h2>
        </div>
        <p className="muted">{t("project.picks.intro")}</p>
        <div className="pick-create">
          <div className="field">
            <label htmlFor="pick-client-name">{t("project.picks.clientName")}</label>
            <input
              id="pick-client-name"
              value={pickClientName}
              onChange={(event) => setPickClientName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pick-limit">{t("project.picks.limit")}</label>
            <input
              id="pick-limit"
              type="number"
              min={1}
              value={pickLimit}
              onChange={(event) => setPickLimit(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="button button--primary"
            disabled={createPickLink.isPending}
            onClick={() => createPickLink.mutate()}
          >
            {createPickLink.isPending ? t("project.picks.creating") : t("project.picks.create")}
          </button>
        </div>
            <div className="client-invite">
              <div className="field">
                <label htmlFor="pick-client-email">{t("client.email")}</label>
                <input
                  id="pick-client-email"
                  type="email"
                  value={effectiveClientEmail}
                  placeholder={t("client.email.placeholder")}
                  onChange={(event) => setClientEmail(event.target.value)}
                />
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={pickSendEmail}
                  disabled={!effectiveClientEmail}
                  onChange={(event) => setPickSendEmail(event.target.checked)}
                />
                {t("client.sendEmail")}
              </label>
              <select
                value={emailLanguage}
                aria-label={t("client.emailLanguage")}
                onChange={(event) => setEmailLanguage(event.target.value as "en" | "ro")}
              >
                <option value="en">English</option>
                <option value="ro">Română</option>
              </select>
            </div>
        {pickEmailNote?.sentTo && (
          <p className="notice notice--good" role="status">
            {t("client.send.done", { email: pickEmailNote.sentTo })}
          </p>
        )}
        {pickEmailNote?.error && (
          <p className="notice" role="alert">
            {t("client.notSent", { reason: pickEmailNote.error })}
          </p>
        )}
        {createPickLink.isError && <p className="error">{(createPickLink.error as Error).message}</p>}
        {pickLink && (
          <div className="share-link">
            <p className="muted">{t("project.picks.linkReady")}</p>
            <a href={pickLink}>{pickLink}</a>{" "}
            <button
              type="button"
              className="button button--small"
              onClick={() => {
                void navigator.clipboard?.writeText(pickLink).then(() => setPickLinkCopied(true));
              }}
            >
              {pickLinkCopied ? t("project.picks.copied") : t("project.picks.copy")}
            </button>
            {pickPassword && (
              <p>
                <span className="muted">{t("access.details.password")}: </span>
                <code className="access-modal__password">{pickPassword}</code>
              </p>
            )}
          </div>
        )}

        {(pickSessions.data ?? []).length === 0 ? (
          <p className="muted">{t("project.picks.empty")}</p>
        ) : (
          <ul className="album-list">
            {(pickSessions.data ?? []).map((session) => (
              <li key={session.id}>
                <div>
                  <span className="album-list__title">{session.clientName}</span>
                  <p className="muted">
                    {session.pickLimit === null
                      ? t("project.picks.progress", {
                          shortlisted: session.shortlistedCount,
                          count: session.pickedCount,
                        })
                      : t("project.picks.progressLimit", {
                          shortlisted: session.shortlistedCount,
                          count: session.pickedCount,
                          limit: session.pickLimit,
                        })}
                  </p>
                  {session.status === "OPEN" && (
                    <p className="muted">
                      {t(session.stage === "SHORTLIST" ? "project.picks.step.shortlist" : "project.picks.step.final")}
                    </p>
                  )}
                  {session.lastSentTo && (
                    <p className="muted">
                      {t("client.sentAt", {
                        email: session.lastSentTo,
                        date: new Date(session.lastSentAt ?? session.createdAt).toLocaleString(),
                      })}
                    </p>
                  )}
                </div>
                <div className="panel__actions">
                  <span className={`chip chip--${session.status.toLowerCase()}`}>
                    {t(`project.picks.status.${session.status.toLowerCase()}`)}
                  </span>
                  {session.passwordProtected && (
                    <button type="button" className="button button--small" onClick={() => setPickDetailsFor(session.id)}>
                      {t("access.details.open")}
                    </button>
                  )}
                  {session.status !== "OPEN" && session.pickedCount > 0 && (
                    <button
                      type="button"
                      className="button button--primary button--small"
                      disabled={buildFromPicks.isPending}
                      onClick={() => buildFromPicks.mutate(session)}
                    >
                      {buildFromPicks.isPending ? t("project.picks.building") : t("project.picks.buildAlbum")}
                    </button>
                  )}
                  {session.status === "SUBMITTED" && (
                    <button
                      type="button"
                      className="button button--small"
                      disabled={reopenPick.isPending}
                      onClick={() => reopenPick.mutate(session.id)}
                    >
                      {t("project.picks.reopen")}
                    </button>
                  )}
                  {session.status !== "REVOKED" && (
                    <button
                      type="button"
                      className="button button--small button--danger"
                      disabled={revokePick.isPending}
                      onClick={() => revokePick.mutate(session.id)}
                    >
                      {t("project.picks.revoke")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {buildFromPicks.isError && <p className="error">{(buildFromPicks.error as Error).message}</p>}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>{t("project.delivery.title")}</h2>
        </div>
        <p className="muted">{t("project.delivery.intro")}</p>
        <div className="pick-create">
          <div className="field">
            <label htmlFor="delivery-client-name">{t("project.delivery.clientName")}</label>
            <input
              id="delivery-client-name"
              value={deliveryClientName}
              onChange={(event) => setDeliveryClientName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="delivery-days">{t("project.delivery.days")}</label>
            <input
              id="delivery-days"
              type="number"
              min={1}
              max={365}
              value={deliveryDays}
              onChange={(event) => setDeliveryDays(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="button button--primary"
            disabled={createDownloadLink.isPending}
            onClick={() => createDownloadLink.mutate()}
          >
            {createDownloadLink.isPending ? t("project.delivery.creating") : t("project.delivery.create")}
          </button>
        </div>
            <div className="client-invite">
              <div className="field">
                <label htmlFor="delivery-client-email">{t("client.email")}</label>
                <input
                  id="delivery-client-email"
                  type="email"
                  value={effectiveClientEmail}
                  placeholder={t("client.email.placeholder")}
                  onChange={(event) => setClientEmail(event.target.value)}
                />
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={deliverySendEmail}
                  disabled={!effectiveClientEmail}
                  onChange={(event) => setDeliverySendEmail(event.target.checked)}
                />
                {t("client.sendEmail")}
              </label>
              <select
                value={emailLanguage}
                aria-label={t("client.emailLanguage")}
                onChange={(event) => setEmailLanguage(event.target.value as "en" | "ro")}
              >
                <option value="en">English</option>
                <option value="ro">Română</option>
              </select>
            </div>
        {deliveryEmailNote?.sentTo && (
          <p className="notice notice--good" role="status">
            {t("client.send.done", { email: deliveryEmailNote.sentTo })}
          </p>
        )}
        {deliveryEmailNote?.error && (
          <p className="notice" role="alert">
            {t("client.notSent", { reason: deliveryEmailNote.error })}
          </p>
        )}
        {createDownloadLink.isError && <p className="error">{(createDownloadLink.error as Error).message}</p>}
        {deliveryLink && (
          <div className="share-link">
            <p className="muted">{t("project.delivery.linkReady")}</p>
            <a href={deliveryLink}>{deliveryLink}</a>{" "}
            <button
              type="button"
              className="button button--small"
              onClick={() => {
                void navigator.clipboard?.writeText(deliveryLink).then(() => setDeliveryCopied(true));
              }}
            >
              {deliveryCopied ? t("project.delivery.copied") : t("project.delivery.copy")}
            </button>
            {deliveryPassword && (
              <p>
                <span className="muted">{t("access.details.password")}: </span>
                <code className="access-modal__password">{deliveryPassword}</code>
              </p>
            )}
            {deliveryMissing > 0 && (
              <p className="muted">{t("project.delivery.missing", { count: deliveryMissing })}</p>
            )}
          </div>
        )}

        {(downloadSessions.data ?? []).length === 0 ? (
          <p className="muted">{t("project.delivery.empty")}</p>
        ) : (
          <ul className="album-list">
            {(downloadSessions.data ?? []).map((session) => (
              <li key={session.id}>
                <div>
                  <span className="album-list__title">{session.clientName}</span>
                  <p className="muted">
                    {session.downloadCount === 0
                      ? t("project.delivery.notDownloaded")
                      : t("project.delivery.downloaded", {
                          count: session.downloadCount,
                          date: new Date(session.lastDownloadedAt ?? session.createdAt).toLocaleString(),
                        })}
                  </p>
                  {session.lastSentTo && (
                    <p className="muted">
                      {t("client.sentAt", {
                        email: session.lastSentTo,
                        date: new Date(session.lastSentAt ?? session.createdAt).toLocaleString(),
                      })}
                    </p>
                  )}
                  {session.status === "ACTIVE" && (
                    <p className="muted">
                      {t("project.delivery.expires", {
                        date: new Date(session.expiresAt).toLocaleDateString(),
                        days: session.daysLeft,
                      })}
                    </p>
                  )}
                </div>
                <div className="panel__actions">
                  <span className={`chip chip--${session.status === "ACTIVE" ? "active" : session.status.toLowerCase()}`}>
                    {t(`project.delivery.status.${session.status.toLowerCase()}`)}
                  </span>
                  {session.passwordProtected && (
                    <button type="button" className="button button--small" onClick={() => setDetailsFor(session.id)}>
                      {t("access.details.open")}
                    </button>
                  )}
                  {session.status === "ACTIVE" && (
                    <button
                      type="button"
                      className="button button--small button--danger"
                      disabled={revokeDownload.isPending}
                      onClick={() => revokeDownload.mutate(session.id)}
                    >
                      {t("project.delivery.revoke")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pickDetailsFor && (
        <AccessDetailsModal
          title={t("access.details.title")}
          queryKey={["pick-access", projectId, pickDetailsFor]}
          load={() => getPickAccess(projectId, pickDetailsFor)}
          urlFor={(token) => `${window.location.origin}/pick/${token}`}
          defaultEmail={effectiveClientEmail}
          onSend={async ({ email, language: emailIn }) => {
            await sendPickInvitation(projectId, pickDetailsFor, { email, language: emailIn });
            await refreshPicks();
          }}
          onClose={() => setPickDetailsFor(null)}
        />
      )}

      {detailsFor && (
        <AccessDetailsModal
          title={t("access.details.title")}
          queryKey={["download-access", projectId, detailsFor]}
          load={() => getDownloadAccess(projectId, detailsFor)}
          urlFor={(token) => `${window.location.origin}/download/${token}`}
          defaultEmail={effectiveClientEmail}
          onSend={async ({ email, language: emailIn }) => {
            await sendDownloadInvitation(projectId, detailsFor, { email, language: emailIn });
            await refreshDownloads();
          }}
          onClose={() => setDetailsFor(null)}
        />
      )}

      <section className="panel">
        <div className="panel__head">
          <h2>{t("project.photos.title")}</h2>
        </div>
        <div className="photo-grid">
          {(photos.data ?? []).map((photo) => {
            const analysis = analysisByPhoto.get(photo.id);
            return (
              <figure key={photo.id} className={`photo-card ${clientPicked.has(photo.id) ? "photo-card--picked" : ""}`}>
                {clientPicked.has(photo.id) && (
                  <span className="photo-card__pick" title={t("project.picks.badge")} aria-label={t("project.picks.badge")}>
                    ♥
                  </span>
                )}
                {(photo.thumbnailUrl ?? photo.previewUrl) ? (
                  <img
                    src={photo.thumbnailUrl ?? photo.previewUrl ?? ""}
                    alt={photo.fileName}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="photo-card__placeholder">{photo.status}</div>
                )}
                <figcaption>
                  <span className="photo-card__name">{photo.fileName}</span>
                  {analysis ? (
                    <span className={`score ${analysis.albumWorthy ? "score--good" : ""}`}>
                      {analysis.overall} · {analysis.category.toLowerCase()}
                    </span>
                  ) : (
                    <span className="muted">{photo.status.toLowerCase().replace(/_/g, " ")}</span>
                  )}
                </figcaption>
              </figure>
            );
          })}
        </div>
        {(photos.data?.length ?? 0) === 0 && <p className="muted">{t("project.photos.empty")}</p>}
      </section>

      {aiConsentOpen && (
        <div className="modal-overlay" role="presentation" onClick={() => setAiConsentOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-consent-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="ai-consent-title">{t("ai.consent.title")}</h2>
            <p>{t("ai.consent.body")}</p>
            <div className="modal__actions">
              <button type="button" className="button" onClick={() => setAiConsentOpen(false)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  setUseAi(true);
                  setAiConsentOpen(false);
                }}
              >
                {t("ai.consent.agree")}
              </button>
            </div>
          </div>
        </div>
      )}

      {upload && (
        <div className="modal-overlay upload-overlay" role="presentation">
          <div className="modal upload-progress" role="dialog" aria-modal="true" aria-labelledby="upload-title">
            <h2 id="upload-title">
              {upload.cancelling ? t("project.upload.cancelling") : t("project.upload.title")}
            </h2>
            <p className="muted">
              {t("project.upload.progress", { done: upload.done, total: upload.total })}
              {upload.failed > 0 && ` · ${t("project.upload.failed", { count: upload.failed })}`}
            </p>
            <div
              className="upload-progress__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={upload.total}
              aria-valuenow={upload.done + upload.failed}
            >
              <div
                className="upload-progress__bar"
                style={{ width: `${Math.round(((upload.done + upload.failed) / upload.total) * 100)}%` }}
              />
            </div>
            <p className="muted">{t("project.upload.keepOpen")}</p>
            <div className="modal__actions">
              <button type="button" className="button" disabled={upload.cancelling} onClick={cancelUpload}>
                {upload.cancelling ? t("project.upload.cancelling") : t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

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
            {removeProject.isError && (
              <p className="error">{(removeProject.error as Error).message}</p>
            )}
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
                {removeProject.isPending
                  ? t("project.deleteShoot.deleting")
                  : t("project.deleteShoot.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {askingLanguage && (
        <LanguagePrompt
          onChoose={() => {
            setAskingLanguage(false);
            generate.mutate();
          }}
        />
      )}

      {dimensionModalOpen && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setDimensionModalOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dimension-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="dimension-modal-title">{t("dimension.modal.title")}</h2>
            <p>{t("dimension.modal.body")}</p>
            <ul className="print-profile-options">
              {ALBUM_DIMENSIONS.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className={`print-profile-option ${
                      dimensionId === option.id ? "print-profile-option--selected" : ""
                    }`}
                    onClick={() => {
                      setDimensionId(option.id);
                      setDimensionModalOpen(false);
                    }}
                  >
                    <strong>
                      {t("dimension.chip", { width: option.widthCm, height: option.heightCm })}
                    </strong>
                    <span className="muted">{t(`dimension.shape.${option.shape}`)}</span>
                  </button>
                </li>
              ))}
              <li>
                <div
                  className={`print-profile-option print-profile-option--custom ${
                    dimensionId === CUSTOM_DIMENSION_ID ? "print-profile-option--selected" : ""
                  }`}
                >
                  <strong>{t("dimension.custom")}</strong>
                  <div className="print-profile-custom-fields">
                    <label>
                      {t("dimension.custom.width")}
                      <input
                        type="number"
                        min={1}
                        step={0.5}
                        value={customWidthCm}
                        onChange={(event) => setCustomWidthCm(Math.max(1, Number(event.target.value)))}
                      />
                    </label>
                    <label>
                      {t("dimension.custom.height")}
                      <input
                        type="number"
                        min={1}
                        step={0.5}
                        value={customHeightCm}
                        onChange={(event) => setCustomHeightCm(Math.max(1, Number(event.target.value)))}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="button button--small"
                    onClick={() => {
                      setDimensionId(CUSTOM_DIMENSION_ID);
                      setDimensionModalOpen(false);
                    }}
                  >
                    {t("dimension.useCustom")}
                  </button>
                </div>
              </li>
            </ul>
            <div className="modal__actions">
              <button
                type="button"
                className="button"
                onClick={() => setDimensionModalOpen(false)}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
