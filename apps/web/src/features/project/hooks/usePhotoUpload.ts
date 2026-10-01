import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SUPPORTED_MIME_TYPES } from "@albumflow/contracts";
import { abandonUpload, confirmUpload, putFileToStorage, requestUpload } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { runWithLimit, sortFilesByName } from "@/features/project/lib/upload-queue";

type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];
const ACCEPTED = new Set<string>(["image/jpeg", "image/png", "image/tiff", "image/webp"]);

/** Uploads in flight at once. Enough to keep a fast connection busy, few enough to stay orderly. */
const UPLOAD_PARALLELISM = 6;

export interface Transfer {
  key: string;
  fileName: string;
  state: "uploading" | "confirming" | "done" | "error";
  message?: string;
}

export interface UploadBatch {
  total: number;
  done: number;
  failed: number;
  cancelling: boolean;
}

/**
 * Uploading a batch of photos to a shoot: a few at a time in file-name order, within the
 * plan's photo limit, cancellable — a cancel also deletes the rows of uploads it cut off —
 * and guarded against a reload mid-batch.
 */
export function usePhotoUpload(options: {
  studioId: string;
  projectId: string;
  useAi: boolean;
  /** Photos per shoot the plan allows; null when unlimited. */
  photoLimit: number | null;
  photoCount: number;
}) {
  const { studioId, projectId, useAi, photoLimit, photoCount } = options;
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  /** Present only while a batch is uploading — it also blocks the rest of the page. */
  const [batch, setBatch] = useState<UploadBatch | null>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  /** Photos created on the server whose upload has not been confirmed — what a cancel must clean up. */
  const unconfirmed = useRef(new Set<string>());

  const updateTransfer = useCallback((key: string, patch: Partial<Transfer>) => {
    setTransfers((prev) => prev.map((transfer) => (transfer.key === key ? { ...transfer, ...patch } : transfer)));
  }, []);

  const uploadOne = useCallback(
    async (file: File, signal?: AbortSignal) => {
      const key = `${file.name}-${file.lastModified}-${file.size}`;
      setTransfers((prev) => [...prev, { key, fileName: file.name, state: "uploading" }]);

      if (!ACCEPTED.has(file.type)) {
        updateTransfer(key, { state: "error", message: "Unsupported file type" });
        setBatch((current) => (current ? { ...current, failed: current.failed + 1 } : current));
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
        setBatch((current) => (current ? { ...current, done: current.done + 1 } : current));
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
        if (!cancelled) setBatch((current) => (current ? { ...current, failed: current.failed + 1 } : current));
      }
    },
    [projectId, studioId, updateTransfer, useAi, t],
  );

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      // In file-name order, a few at a time — not all at once — so the shoot fills up in
      // order and a thousand photos do not open a thousand connections.
      let files = sortFilesByName(Array.from(fileList));
      setLimitNotice(null);
      if (photoLimit !== null) {
        const room = Math.max(0, photoLimit - photoCount);
        if (files.length > room) {
          setLimitNotice(t("project.limit.reached", { limit: photoLimit, skipped: files.length - room }));
          files = files.slice(0, room);
        }
        if (files.length === 0) return;
      }
      const controller = new AbortController();
      abort.current = controller;
      unconfirmed.current = new Set();
      setBatch({ total: files.length, done: 0, failed: 0, cancelling: false });

      void runWithLimit(files, UPLOAD_PARALLELISM, (file) => uploadOne(file, controller.signal), controller.signal)
        .then(async () => {
          // Anything still unconfirmed here was cut off by a cancel: the rows exist on the
          // server but no photo does, so they are thrown away rather than left behind.
          const orphans = [...unconfirmed.current];
          unconfirmed.current = new Set();
          if (orphans.length > 0) {
            setBatch((current) => (current ? { ...current, cancelling: true } : current));
            await Promise.allSettled(orphans.map((photoId) => abandonUpload(photoId)));
          }
        })
        .finally(() => {
          abort.current = null;
          setBatch(null);
          void queryClient.invalidateQueries({ queryKey: ["photos", projectId] });
        });
    },
    [uploadOne, queryClient, projectId, photoLimit, photoCount, t],
  );

  const cancel = useCallback(() => {
    setBatch((current) => (current ? { ...current, cancelling: true } : current));
    abort.current?.abort();
  }, []);

  // A reload mid-batch would strand half-uploaded photos, so the browser asks first.
  useEffect(() => {
    if (!batch) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [batch]);

  return {
    transfers,
    batch,
    limitNotice,
    inFlight: transfers.filter((transfer) => transfer.state === "uploading" || transfer.state === "confirming"),
    failed: transfers.filter((transfer) => transfer.state === "error"),
    handleFiles,
    cancel,
  };
}

export type PhotoUpload = ReturnType<typeof usePhotoUpload>;
