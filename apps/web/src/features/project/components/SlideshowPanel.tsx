import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  extendSlideshowSession,
  getSlideshowAccess,
  listProjectAlbums,
  listSlideshowSessions,
  openSlideshowSession,
  refreshSlideshowPhotos,
  revokeSlideshowSession,
  sendSlideshowInvitation,
  updateSlideshowSettings,
  type SlideshowSessionSummary,
  type SlideshowSource,
} from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { AccessDetailsModal } from "@/shared/ui/AccessDetailsModal";
import { PlanUpsell } from "@/shared/ui/PlanUpsell";
import type { ClientContact } from "@/features/project/hooks/useClientContact";
import { ClientLinkForm } from "./ClientLinkForm";
import { LinkResult, noteFrom, type CreatedLink, type EmailNote } from "./LinkResult";

const INTERVALS = [3, 4, 5, 6, 8, 10, 12, 15];

/** A shareable, auto-playing slideshow of the client's picks, an album or the whole shoot. No password. */
export function SlideshowPanel({
  projectId,
  contact,
  canSendSlideshows,
}: {
  projectId: string;
  contact: ClientContact;
  /** The studio's plan includes slideshows. */
  canSendSlideshows: boolean;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [source, setSource] = useState<SlideshowSource>("PICKS");
  const [albumId, setAlbumId] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState(5);
  const [fade, setFade] = useState(true);
  const [days, setDays] = useState("180");
  const [sendEmail, setSendEmail] = useState(false);
  const [note, setNote] = useState<EmailNote | null>(null);
  const [link, setLink] = useState<CreatedLink | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: ["slideshow-sessions", projectId],
    queryFn: () => listSlideshowSessions(projectId),
    refetchInterval: 15000,
  });
  // The same query the project page already holds, so this costs no extra request.
  const albums = useQuery({ queryKey: ["albums", projectId], queryFn: () => listProjectAlbums(projectId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["slideshow-sessions", projectId] });
  const hasSessions = (sessions.data ?? []).length > 0;
  // Only once the list has loaded: an empty shoot opens on the form, a shoot with links does not.
  const showForm = formOpen || (sessions.isSuccess && !hasSessions);
  const chosenAlbum = albumId || albums.data?.[0]?.id || "";
  const urlFor = (token: string) => `${window.location.origin}/slideshow/${token}`;

  const create = useMutation({
    mutationFn: () =>
      openSlideshowSession(projectId, {
        // Blank is fine: the server falls back to the client on the shoot.
        clientName: clientName.trim() || contact.name || "",
        source,
        ...(source === "ALBUM" && chosenAlbum ? { albumId: chosenAlbum } : {}),
        intervalSeconds,
        transition: fade ? "FADE" : "NONE",
        ...(Number(days) > 0 ? { ttlDays: Math.min(365, Math.floor(Number(days))) } : {}),
        ...(contact.email ? { clientEmail: contact.email } : {}),
        ...(sendEmail ? { sendEmail: true, language: contact.emailLanguage } : {}),
      }),
    onSuccess: (session) => {
      setNote(noteFrom(session));
      setLink({ url: urlFor(session.token), password: null });
      setFormOpen(false);
      void refresh();
    },
  });
  // One mutation for every per-link action; the list refreshes from the server afterwards.
  const act = useMutation({
    mutationFn: ({ action, session }: { action: RowAction; session: SlideshowSessionSummary }) => {
      if (action === "extend") return extendSlideshowSession(projectId, session.id);
      if (action === "refresh") return refreshSlideshowPhotos(projectId, session.id);
      if (action === "speed") {
        const next = INTERVALS[(INTERVALS.indexOf(session.intervalSeconds) + 1) % INTERVALS.length]!;
        return updateSlideshowSettings(projectId, session.id, { intervalSeconds: next });
      }
      return revokeSlideshowSession(projectId, session.id);
    },
    onSettled: refresh,
  });

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{t("project.slideshow.title")}</h2>
        {canSendSlideshows && !showForm && (
          <button type="button" className="button button--primary" onClick={() => setFormOpen(true)}>
            {t("project.slideshow.new")}
          </button>
        )}
      </div>
      <p className="muted">{t("project.slideshow.intro")}</p>
      {!canSendSlideshows && <PlanUpsell feature="slideshows" />}
      {sessions.isLoading && <p className="muted">{t("project.slideshow.loading")}</p>}
      {sessions.isError && (
        <p className="error" role="alert">
          {t("project.slideshow.loadError", { reason: (sessions.error as Error).message })}
        </p>
      )}
      {canSendSlideshows && showForm && (
        <>
          <div className="slideshow-form">
            <fieldset className="field">
              <legend>{t("project.slideshow.source")}</legend>
              {(["PICKS", "ALBUM", "SHOOT"] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="slideshow-source"
                    value={value}
                    checked={source === value}
                    disabled={value === "ALBUM" && (albums.data ?? []).length === 0}
                    onChange={() => setSource(value)}
                  />
                  {t(`project.slideshow.source.${value.toLowerCase()}`)}
                </label>
              ))}
            </fieldset>
            {source === "ALBUM" && (albums.data ?? []).length > 1 && (
              <div className="field">
                <label htmlFor="slideshow-album">{t("project.slideshow.album")}</label>
                <select id="slideshow-album" value={chosenAlbum} onChange={(event) => setAlbumId(event.target.value)}>
                  {(albums.data ?? []).map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="slideshow-interval">{t("project.slideshow.interval")}</label>
              <select
                id="slideshow-interval"
                value={intervalSeconds}
                onChange={(event) => setIntervalSeconds(Number(event.target.value))}
              >
                {INTERVALS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {t("project.slideshow.seconds", { count: seconds })}
                  </option>
                ))}
              </select>
            </div>
            <label>
              <input type="checkbox" checked={fade} onChange={(event) => setFade(event.target.checked)} />
              {t("project.slideshow.fade")}
            </label>
          </div>
          <ClientLinkForm
            idPrefix="slideshow"
            nameLabel={t("project.delivery.clientName")}
            name={clientName}
            onNameChange={setClientName}
            setting={{ label: t("project.delivery.days"), value: days, onChange: setDays, min: 1, max: 365 }}
            submit={{
              label: t("project.slideshow.create"),
              pendingLabel: t("project.delivery.creating"),
              tip: t("tip.slideshowLink"),
              pending: create.isPending,
              onSubmit: () => create.mutate(),
            }}
            contact={contact}
            sendEmail={sendEmail}
            onSendEmailChange={setSendEmail}
            onCancel={hasSessions ? () => setFormOpen(false) : undefined}
          />
        </>
      )}
      <LinkResult
        note={note}
        error={create.isError ? (create.error as Error) : null}
        link={link}
        readyLabel={t("project.slideshow.linkReady")}
        copyLabel={t("project.delivery.copy")}
        copiedLabel={t("project.delivery.copied")}
      />
      {act.isError && <p className="error">{(act.error as Error).message}</p>}

      {hasSessions && (
        <ul className="album-list">
          {(sessions.data ?? []).map((session) => (
            <li key={session.id}>
              <div>
                <span className="album-list__title">{session.clientName}</span>
                <p className="muted">
                  {t("project.slideshow.summary", {
                    source: t(`project.slideshow.source.${session.source.toLowerCase()}`),
                    count: session.photoCount,
                    seconds: session.intervalSeconds,
                  })}
                </p>
                <p className="muted">
                  {session.viewCount === 0
                    ? t("project.slideshow.notViewed")
                    : t("project.slideshow.viewed", {
                        count: session.viewCount,
                        date: new Date(session.lastViewedAt ?? session.createdAt).toLocaleString(),
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
                {session.status !== "REVOKED" && (
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
                {session.status === "ACTIVE" && (
                  <button type="button" className="button button--small" onClick={() => setDetailsFor(session.id)}>
                    {t("project.slideshow.share")}
                  </button>
                )}
                {session.status !== "REVOKED" && (
                  <>
                    <RowButton action="extend" session={session} act={act} label={t("project.slideshow.extend")} />
                    <RowButton action="refresh" session={session} act={act} label={t("project.slideshow.refresh")} />
                    <RowButton
                      action="speed"
                      session={session}
                      act={act}
                      label={t("project.slideshow.speed", { seconds: session.intervalSeconds })}
                    />
                    <RowButton
                      action="revoke"
                      session={session}
                      act={act}
                      label={t("project.delivery.revoke")}
                      danger
                    />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {detailsFor && (
        <AccessDetailsModal
          title={t("project.slideshow.share")}
          queryKey={["slideshow-access", projectId, detailsFor]}
          load={() => getSlideshowAccess(projectId, detailsFor)}
          urlFor={urlFor}
          defaultEmail={contact.email}
          onSend={async ({ email, language }) => {
            await sendSlideshowInvitation(projectId, detailsFor, { email, language });
            await refresh();
          }}
          onClose={() => setDetailsFor(null)}
        />
      )}
    </section>
  );
}

type RowAction = "extend" | "refresh" | "speed" | "revoke";

function RowButton(props: {
  action: RowAction;
  session: SlideshowSessionSummary;
  act: { isPending: boolean; mutate: (input: { action: RowAction; session: SlideshowSessionSummary }) => void };
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`button button--small ${props.danger ? "button--danger" : ""}`}
      disabled={props.act.isPending}
      onClick={() => props.act.mutate({ action: props.action, session: props.session })}
    >
      {props.label}
    </button>
  );
}
