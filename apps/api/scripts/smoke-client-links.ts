/**
 * The three links a photographer hands to a client — album review, photo
 * selection, and download — driven end to end against a running API. Every one is
 * protected by a generated password, so each check proves both halves: the link is
 * locked without it, and opens with it.
 *
 * Kept out of smoke.ts so the very same code can be pointed at the in-memory demo
 * server on a laptop, where there is no Postgres to run the full smoke test.
 */
export interface ClientLinkContext {
  baseUrl: string;
  /** The studio-authenticated JSON call the smoke test already uses. Throws on a non-2xx answer. */
  api: <T>(path: string, init?: RequestInit, headers?: Record<string, string>) => Promise<T>;
  projectId: string;
  albumId: string;
  check: (name: string, passed: boolean, detail?: string) => void;
  waitFor: <T>(attempt: () => Promise<T | undefined>) => Promise<T | undefined>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

interface Created {
  sessionId: string;
  token: string;
  password?: string;
}

type Kind = "review" | "pick" | "download";

export async function runClientLinkChecks(context: ClientLinkContext): Promise<void> {
  await reviewLink(context);
  await selectionLink(context);
  await downloadLink(context);
}

/** The gate every protected link shares: locked, wrong password refused, right password (any case) opens. */
async function passThroughGate(
  { baseUrl, check }: ClientLinkContext,
  kind: Kind,
  label: string,
  link: Created,
): Promise<string> {
  check(`${label}: a new link comes with a generated password`, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(link.password ?? ""));

  const locked = await fetch(`${baseUrl}/${kind}/${link.token}`);
  const lockedBody = (await locked.json().catch(() => ({}))) as { code?: string };
  check(
    `${label}: locked until the password is entered`,
    locked.status === 401 && lockedBody.code === "PASSWORD_REQUIRED",
    `got ${locked.status} ${lockedBody.code ?? ""}`,
  );

  const wrong = await fetch(`${baseUrl}/${kind}/${link.token}/unlock`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ password: "WRONG-WRONG" }),
  });
  check(`${label}: a wrong password is refused`, wrong.status === 401, `got ${wrong.status}`);

  // Typed the way a person would: lower case, no dash.
  const typed = (link.password ?? "").toLowerCase().replace("-", "");
  const unlocked = await fetch(`${baseUrl}/${kind}/${link.token}/unlock`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ password: typed }),
  });
  const { grant } = (await unlocked.json().catch(() => ({}))) as { grant?: string };
  check(`${label}: the right password unlocks it`, unlocked.ok && Boolean(grant), `got ${unlocked.status}`);
  return grant ?? "";
}

async function reviewLink(context: ClientLinkContext): Promise<void> {
  const { api, albumId, check } = context;
  const link = await api<Created>(`/albums/${albumId}/review-sessions`, {
    method: "POST",
    body: JSON.stringify({ clientName: "Smoke Client" }),
  });
  const grant = await passThroughGate(context, "review", "album review", link);

  await api(
    `/review/${link.token}/comments`,
    { method: "POST", body: JSON.stringify({ spreadIndex: 0, body: "Smoke note" }) },
    { ...JSON_HEADERS, "X-Access-Grant": grant },
  );

  const shown = await api<{ token: string; password: string }>(
    `/albums/${albumId}/review-sessions/${link.sessionId}/access`,
  );
  check(
    "album review: the studio can read the link and password again",
    shown.token === link.token && shown.password === link.password,
  );
}

async function selectionLink(context: ClientLinkContext): Promise<void> {
  const { api, baseUrl, projectId, check } = context;
  const link = await api<Created>(`/projects/${projectId}/pick-sessions`, {
    method: "POST",
    body: JSON.stringify({ clientName: "Smoke Client" }),
  });
  const grant = await passThroughGate(context, "pick", "photo selection", link);
  const gated = { ...JSON_HEADERS, "X-Access-Grant": grant };

  const view = await api<{ photos: { id: string; thumbnailUrl: string }[] }>(`/pick/${link.token}`, {}, gated);
  check(
    "photo selection: the client sees display copies to choose from",
    view.photos.length > 0 && view.photos.every((photo) => photo.thumbnailUrl.includes("/derivatives/")),
    `${view.photos.length} photos`,
  );

  // Step 1: mark a possibility. The photographer's limit does not apply here.
  const chosen = view.photos[0]?.id ?? "";
  const marked = await api<{ stage: string; shortlistedPhotoIds: string[]; pickedPhotoIds: string[] }>(
    `/pick/${link.token}/photos/${chosen}`,
    { method: "PUT", body: JSON.stringify({ picked: true }) },
    gated,
  );
  check(
    "photo selection: step 1 marks a photo as a possibility",
    marked.stage === "SHORTLIST" && marked.shortlistedPhotoIds.includes(chosen) && marked.pickedPhotoIds.length === 0,
  );

  // Step 2: one marked photo and no limit, so it is carried over as the choice.
  const moved = await api<{ stage: string; pickedPhotoIds: string[] }>(
    `/pick/${link.token}/stage`,
    { method: "POST", body: JSON.stringify({ stage: "FINAL" }) },
    gated,
  );
  check(
    "photo selection: step 2 carries a shortlist that already fits",
    moved.stage === "FINAL" && moved.pickedPhotoIds.includes(chosen),
  );

  const submitted = await api<{ status: string }>(`/pick/${link.token}/submit`, { method: "POST" }, gated);
  check("photo selection: the client submits", submitted.status === "SUBMITTED", submitted.status);

  const locked = await fetch(`${baseUrl}/pick/${link.token}/photos/${chosen}`, {
    method: "PUT",
    headers: gated,
    body: JSON.stringify({ picked: false }),
  });
  check("photo selection: a submitted selection is frozen", locked.status === 409, `got ${locked.status}`);

  const sessions = await api<
    { status: string; stage: string; shortlistedCount: number; pickedCount: number; passwordProtected: boolean }[]
  >(`/projects/${projectId}/pick-sessions`);
  check(
    "photo selection: the studio sees it as sent, with both counts",
    sessions[0]?.status === "SUBMITTED" &&
      sessions[0]?.stage === "FINAL" &&
      sessions[0]?.shortlistedCount === 1 &&
      sessions[0]?.pickedCount === 1 &&
      sessions[0]?.passwordProtected === true,
  );

  const shown = await api<{ token: string; password: string }>(
    `/projects/${projectId}/pick-sessions/${link.sessionId}/access`,
  );
  check(
    "photo selection: the studio can read the link and password again",
    shown.token === link.token && shown.password === link.password,
  );
}

async function downloadLink(context: ClientLinkContext): Promise<void> {
  const { api, baseUrl, projectId, check, waitFor } = context;
  const link = await api<Created & { photoCount: number }>(`/projects/${projectId}/download-sessions`, {
    method: "POST",
    body: JSON.stringify({ clientName: "Smoke Client", ttlDays: 30 }),
  });
  const grant = await passThroughGate(context, "download", "download", link);
  const gated = { ...JSON_HEADERS, "X-Access-Grant": grant };

  const view = await api<{ photoCount: number; daysLeft: number; photos: unknown[] }>(
    `/download/${link.token}`,
    {},
    gated,
  );
  check(
    "download: the client sees how many photos and how long they last",
    view.photoCount > 0 && view.daysLeft === 30 && view.photos.length > 0,
    `${view.photoCount} photos, ${view.daysLeft} days left`,
  );

  const zip = await fetch(`${baseUrl}/download/${link.token}/photos.zip?grant=${encodeURIComponent(grant)}`);
  const bytes = Buffer.from(await zip.arrayBuffer());
  check(
    "download: the zip is a real archive of the originals",
    zip.status === 200 && bytes.subarray(0, 2).toString() === "PK" && bytes.byteLength > 10_000,
    `status ${zip.status}, ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB`,
  );

  const counted = await waitFor(async () => {
    const sessions = await api<{ downloadCount: number }[]>(`/projects/${projectId}/download-sessions`);
    return sessions[0]?.downloadCount === 1 ? sessions[0] : undefined;
  });
  check("download: the studio sees it counted", counted?.downloadCount === 1);

  const shown = await api<{ token: string; password: string }>(
    `/projects/${projectId}/download-sessions/${link.sessionId}/access`,
  );
  check(
    "download: the studio can read the link and password again",
    shown.token === link.token && shown.password === link.password,
  );

  await api(`/projects/${projectId}/download-sessions/${link.sessionId}/revoke`, { method: "POST" });
  const revoked = await fetch(`${baseUrl}/download/${link.token}`, { headers: gated });
  check("download: a disabled link stops working", revoked.status === 409, `got ${revoked.status}`);
}
