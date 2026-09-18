import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { SUPPORTED_MIME_TYPES } from "@albumflow/contracts";
import {
  confirmUpload,
  deleteProject,
  getAiStatus,
  getProject,
  generateAlbum,
  listProjectAlbums,
  listProjectAnalyses,
  listProjectPhotos,
  putFileToStorage,
  requestUpload,
} from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { LanguagePrompt } from "../../components/LanguagePrompt";
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

export function ProjectPage() {
  const { studioId } = useAuth();
  const { t, hasChosenLanguage } = useLanguage();
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
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
    async (file: File) => {
      const key = `${file.name}-${file.lastModified}-${file.size}`;
      setTransfers((prev) => [...prev, { key, fileName: file.name, state: "uploading" }]);

      if (!ACCEPTED.has(file.type)) {
        updateTransfer(key, { state: "error", message: "Unsupported file type" });
        return;
      }

      try {
        const { photoId, uploadUrl } = await requestUpload(studioId, projectId, {
          fileName: file.name,
          mimeType: file.type as SupportedMimeType,
          byteSize: file.size,
        });
        await putFileToStorage(uploadUrl, file);
        updateTransfer(key, { state: "confirming" });
        await confirmUpload(photoId, { useAi });
        updateTransfer(key, { state: "done" });
        void queryClient.invalidateQueries({ queryKey: ["photos", projectId] });
      } catch (error) {
        updateTransfer(key, {
          state: "error",
          message: error instanceof Error ? error.message : "Upload failed",
        });
      }
    },
    [projectId, queryClient, updateTransfer, useAi],
  );

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      Array.from(fileList).forEach((file) => void uploadOne(file));
    },
    [uploadOne],
  );

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
          onClick={() => setConfirmingDelete(true)}
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
          <h2>{t("project.photos.title")}</h2>
        </div>
        <div className="photo-grid">
          {(photos.data ?? []).map((photo) => {
            const analysis = analysisByPhoto.get(photo.id);
            return (
              <figure key={photo.id} className="photo-card">
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
