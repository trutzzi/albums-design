import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { SUPPORTED_MIME_TYPES } from "@albumflow/contracts";
import {
  confirmUpload,
  deleteProject,
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

  const generate = useMutation({
    mutationFn: () => generateAlbum(projectId, { targetSpreads }),
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
        await confirmUpload(photoId);
        updateTransfer(key, { state: "done" });
        void queryClient.invalidateQueries({ queryKey: ["photos", projectId] });
      } catch (error) {
        updateTransfer(key, {
          state: "error",
          message: error instanceof Error ? error.message : "Upload failed",
        });
      }
    },
    [projectId, queryClient, updateTransfer],
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
    </div>
  );
}
