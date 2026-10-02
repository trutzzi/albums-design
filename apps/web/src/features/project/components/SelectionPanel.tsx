import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AlbumFormatDTO } from "@albumflow/contracts";
import {
  generateAlbum,
  getPickAccess,
  listPickSessions,
  openPickSession,
  reopenPickSession,
  revokePickSession,
  sendPickInvitation,
  type PickSessionSummary,
} from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { AccessDetailsModal } from "@/shared/ui/AccessDetailsModal";
import type { ClientContact } from "@/features/project/hooks/useClientContact";
import { ClientLinkForm } from "./ClientLinkForm";
import { LinkResult, noteFrom, type CreatedLink, type EmailNote } from "./LinkResult";

/** Client photo selection: send a link, follow the client's progress, build the album from their picks. */
export function SelectionPanel({
  projectId,
  contact,
  albumFormat,
}: {
  projectId: string;
  contact: ClientContact;
  /** The size "Build album" makes, the same one "Generate draft" uses. */
  albumFormat: AlbumFormatDTO;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [pickLimit, setPickLimit] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [note, setNote] = useState<EmailNote | null>(null);
  const [link, setLink] = useState<CreatedLink | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: ["pick-sessions", projectId],
    queryFn: () => listPickSessions(projectId),
    refetchInterval: 15000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["pick-sessions", projectId] });
  const hasSessions = (sessions.data ?? []).length > 0;
  // Folded away once the shoot has links; the list of them is what matters then.
  const showForm = formOpen || !hasSessions;

  const create = useMutation({
    mutationFn: () =>
      openPickSession(projectId, {
        clientName: clientName.trim() || contact.name || "Client",
        ...(Number(pickLimit) > 0 ? { pickLimit: Math.floor(Number(pickLimit)) } : {}),
        ...(contact.email ? { clientEmail: contact.email } : {}),
        ...(sendEmail ? { sendEmail: true, language: contact.emailLanguage } : {}),
      }),
    onSuccess: (session) => {
      setNote(noteFrom(session));
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setLink({ url: `${window.location.origin}/pick/${session.token}`, password: session.password ?? null });
      setFormOpen(false);
      void refresh();
    },
  });
  const reopen = useMutation({
    mutationFn: (sessionId: string) => reopenPickSession(projectId, sessionId),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (sessionId: string) => revokePickSession(projectId, sessionId),
    onSuccess: refresh,
  });
  const buildFromPicks = useMutation({
    mutationFn: (session: PickSessionSummary) =>
      generateAlbum(projectId, {
        title: t("project.picks.buildTitle", { name: session.clientName }),
        // Sized from the picks themselves, not the spread-count field.
        photoIds: session.pickedPhotoIds,
        format: albumFormat,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["albums", projectId] }),
  });

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{t("project.picks.title")}</h2>
        {!showForm && (
          <button type="button" className="button button--primary" onClick={() => setFormOpen(true)}>
            {t("project.picks.new")}
          </button>
        )}
      </div>
      <p className="muted">{t("project.picks.intro")}</p>
      {showForm && (
        <ClientLinkForm
          idPrefix="pick"
          nameLabel={t("project.picks.clientName")}
          name={clientName}
          onNameChange={setClientName}
          setting={{ label: t("project.picks.limit"), value: pickLimit, onChange: setPickLimit, min: 1 }}
          submit={{
            label: t("project.picks.create"),
            pendingLabel: t("project.picks.creating"),
            tip: t("tip.pickLink"),
            pending: create.isPending,
            onSubmit: () => create.mutate(),
          }}
          contact={contact}
          sendEmail={sendEmail}
          onSendEmailChange={setSendEmail}
          onCancel={hasSessions ? () => setFormOpen(false) : undefined}
        />
      )}
      <LinkResult
        note={note}
        error={create.isError ? (create.error as Error) : null}
        link={link}
        readyLabel={t("project.picks.linkReady")}
        copyLabel={t("project.picks.copy")}
        copiedLabel={t("project.picks.copied")}
      />

      {hasSessions && (
        <ul className="album-list">
          {(sessions.data ?? []).map((session) => (
            <li key={session.id}>
              <div>
                <span className="album-list__title">{session.clientName}</span>
                <p className="muted">
                  {session.pickLimit === null
                    ? t("project.picks.progress", { shortlisted: session.shortlistedCount, count: session.pickedCount })
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
                  <button type="button" className="button button--small" onClick={() => setDetailsFor(session.id)}>
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
                    disabled={reopen.isPending}
                    onClick={() => reopen.mutate(session.id)}
                  >
                    {t("project.picks.reopen")}
                  </button>
                )}
                {session.status !== "REVOKED" && (
                  <button
                    type="button"
                    className="button button--small button--danger"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(session.id)}
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

      {detailsFor && (
        <AccessDetailsModal
          title={t("access.details.title")}
          queryKey={["pick-access", projectId, detailsFor]}
          load={() => getPickAccess(projectId, detailsFor)}
          urlFor={(token) => `${window.location.origin}/pick/${token}`}
          defaultEmail={contact.email}
          onSend={async ({ email, language }) => {
            await sendPickInvitation(projectId, detailsFor, { email, language });
            await refresh();
          }}
          onClose={() => setDetailsFor(null)}
        />
      )}
    </section>
  );
}
