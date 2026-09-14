import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { SUPPORTED_MIME_TYPES } from "@albumflow/contracts";
import {
  DEMO_STUDIO_ID,
  confirmUpload,
  getProject,
  generateAlbum,
  listProjectAlbums,
  listProjectAnalyses,
  listProjectPhotos,
  putFileToStorage,
  requestUpload,
} from "../../lib/api";

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
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isDragging, setDragging] = useState(false);
  const [targetSpreads, setTargetSpreads] = useState(10);

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
        const { photoId, uploadUrl } = await requestUpload(DEMO_STUDIO_ID, projectId, {
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

  const analysed = analyses.data?.length ?? 0;
  const albumWorthy = (analyses.data ?? []).filter((analysis) => analysis.albumWorthy).length;
  const inFlight = transfers.filter((t) => t.state === "uploading" || t.state === "confirming");

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <Link to="/" className="muted back-link">
            ← All shoots
          </Link>
          <h1>{project.data?.name ?? "Loading…"}</h1>
          <p className="muted">
            {photos.data?.length ?? 0} uploaded · {analysed} analysed · {albumWorthy} album-worthy
          </p>
        </div>
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
        <p className="dropzone__title">Drop culled selects here</p>
        <p className="muted">JPEG, PNG, TIFF or WebP — up to 75MB each</p>
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
          Uploading {inFlight.length} file{inFlight.length === 1 ? "" : "s"}…
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
          <h2>Generate an album</h2>
          <div className="panel__actions">
            <label htmlFor="target-spreads" className="muted">
              Target spreads
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
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? "Generating…" : "Generate draft"}
            </button>
          </div>
        </div>
        {analysed === 0 && (
          <p className="muted">Analysis has to finish before a draft can be built.</p>
        )}
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
          <h2>Photos</h2>
        </div>
        <div className="photo-grid">
          {(photos.data ?? []).map((photo) => {
            const analysis = analysisByPhoto.get(photo.id);
            return (
              <figure key={photo.id} className="photo-card">
                {photo.previewUrl ? (
                  <img src={photo.previewUrl} alt={photo.fileName} loading="lazy" />
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
        {(photos.data?.length ?? 0) === 0 && <p className="muted">No photos uploaded yet.</p>}
      </section>
    </div>
  );
}
