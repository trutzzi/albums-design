/** A shoot's workflow, in order. Each step is a tab; the photographer can open any of them. */
export const SHOOT_STEPS = ["photos", "selection", "album", "delivery"] as const;
export type ShootStep = (typeof SHOOT_STEPS)[number];

/** A translation key and its values: the caller renders it in the current language. */
export interface Message {
  key: string;
  params?: Record<string, string | number>;
}

export type NextAction = "addPhotos" | "toSelection" | "toAlbum" | "openAlbum" | "seePicks" | "toDelivery";

export interface ShootFacts {
  uploaded: number;
  analysed: number;
  /** Photos whose analysis failed for good; they count as processed, never as "still working". */
  failed?: number;
  albums: { id: string; status: string }[];
  picks: { status: string; clientName: string }[];
  deliveries: { status: string; downloadCount: number }[];
}

export interface ShootWorkflow {
  steps: Record<ShootStep, { done: boolean; status: Message }>;
  next: { text: Message; actions: NextAction[]; albumId?: string };
}

/**
 * Where a shoot stands, worked out from its data alone: each step's status, and the one
 * thing to do next. Nothing is stored, so it can never disagree with what is on the page.
 */
export function shootWorkflow({
  uploaded,
  analysed,
  failed = 0,
  albums,
  picks,
  deliveries,
}: ShootFacts): ShootWorkflow {
  const processed = analysed + failed;
  const submittedPick = picks.find((session) => session.status === "SUBMITTED");
  const openPick = picks.find((session) => session.status === "OPEN");
  const firstAlbum = albums[0];
  const approvedAlbum = albums.find((album) => album.status === "APPROVED" || album.status === "EXPORTED");
  const delivered = deliveries.some((session) => session.downloadCount > 0);
  const deliveryActive = deliveries.some((session) => session.status === "ACTIVE");

  const steps: ShootWorkflow["steps"] = {
    photos: {
      done: uploaded > 0 && processed >= uploaded,
      status:
        uploaded === 0
          ? { key: "project.step.photos.empty" }
          : processed < uploaded
            ? { key: "project.step.photos.processing", params: { done: processed, total: uploaded } }
            : { key: "project.step.photos.ready", params: { count: uploaded } },
    },
    selection: {
      done: Boolean(submittedPick),
      status: submittedPick
        ? { key: "project.step.selection.received" }
        : openPick
          ? { key: "project.step.selection.waiting" }
          : { key: "project.step.selection.optional" },
    },
    album: {
      done: Boolean(approvedAlbum),
      status: approvedAlbum
        ? { key: "project.step.album.approved" }
        : firstAlbum
          ? { key: "project.step.album.draft", params: { count: albums.length } }
          : { key: "project.step.album.none" },
    },
    delivery: {
      done: delivered,
      status: delivered
        ? { key: "project.step.delivery.downloaded" }
        : deliveryActive
          ? { key: "project.step.delivery.active" }
          : { key: "project.step.delivery.none" },
    },
  };

  const next: ShootWorkflow["next"] =
    uploaded === 0
      ? { text: { key: "project.next.upload" }, actions: ["addPhotos"] }
      : delivered || (approvedAlbum && deliveryActive)
        ? { text: { key: "project.next.done" }, actions: [] }
        : approvedAlbum
          ? { text: { key: "project.next.deliver" }, actions: ["toDelivery"] }
          : firstAlbum
            ? { text: { key: "project.next.editAlbum" }, actions: ["openAlbum"], albumId: firstAlbum.id }
            : submittedPick
              ? {
                  text: { key: "project.next.picksIn", params: { name: submittedPick.clientName } },
                  actions: ["seePicks"],
                }
              : openPick
                ? {
                    text: { key: "project.next.waitingPicks", params: { name: openPick.clientName } },
                    actions: ["toAlbum"],
                  }
                : processed < uploaded
                  ? {
                      text: { key: "project.next.processing", params: { done: processed, total: uploaded } },
                      actions: ["toSelection"],
                    }
                  : { text: { key: "project.next.start" }, actions: ["toSelection", "toAlbum"] };

  return { steps, next };
}
