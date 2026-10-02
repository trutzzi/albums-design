import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDownloadAccess,
  listDownloadSessions,
  openDownloadSession,
  revokeDownloadSession,
  sendDownloadInvitation,
} from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { AccessDetailsModal } from "@/shared/ui/AccessDetailsModal";
import { PlanUpsell } from "@/shared/ui/PlanUpsell";
import type { ClientContact } from "@/features/project/hooks/useClientContact";
import { ClientLinkForm } from "./ClientLinkForm";
import { LinkResult, noteFrom, type CreatedLink, type EmailNote } from "./LinkResult";

/** Delivery: a time-limited link where the client downloads every photo at full size. */
export function DeliveryPanel({
  projectId,
  contact,
  canSendDownloadLinks,
}: {
  projectId: string;
  contact: ClientContact;
  /** The studio's plan includes download links. */
  canSendDownloadLinks: boolean;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [days, setDays] = useState("30");
  const [sendEmail, setSendEmail] = useState(false);
  const [note, setNote] = useState<EmailNote | null>(null);
  const [link, setLink] = useState<CreatedLink | null>(null);
  const [missing, setMissing] = useState(0);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: ["download-sessions", projectId],
    queryFn: () => listDownloadSessions(projectId),
    refetchInterval: 15000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["download-sessions", projectId] });
  const hasSessions = (sessions.data ?? []).length > 0;
  const showForm = formOpen || !hasSessions;

  const create = useMutation({
    mutationFn: () =>
      openDownloadSession(projectId, {
        clientName: clientName.trim() || contact.name || "Client",
        ...(Number(days) > 0 ? { ttlDays: Math.floor(Number(days)) } : {}),
        ...(contact.email ? { clientEmail: contact.email } : {}),
        ...(sendEmail ? { sendEmail: true, language: contact.emailLanguage } : {}),
      }),
    onSuccess: (session) => {
      setNote(noteFrom(session));
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setLink({ url: `${window.location.origin}/download/${session.token}`, password: session.password ?? null });
      setMissing(session.missingCount);
      setFormOpen(false);
      void refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (sessionId: string) => revokeDownloadSession(projectId, sessionId),
    onSuccess: refresh,
  });

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{t("project.delivery.title")}</h2>
        {canSendDownloadLinks && !showForm && (
          <button type="button" className="button button--primary" onClick={() => setFormOpen(true)}>
            {t("project.delivery.new")}
          </button>
        )}
      </div>
      <p className="muted">{t("project.delivery.intro")}</p>
      {!canSendDownloadLinks && <PlanUpsell feature="downloadLinks" />}
      {canSendDownloadLinks && showForm && (
        <ClientLinkForm
          idPrefix="delivery"
          nameLabel={t("project.delivery.clientName")}
          name={clientName}
          onNameChange={setClientName}
          setting={{ label: t("project.delivery.days"), value: days, onChange: setDays, min: 1, max: 365 }}
          submit={{
            label: t("project.delivery.create"),
            pendingLabel: t("project.delivery.creating"),
            tip: t("tip.deliveryLink"),
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
        readyLabel={t("project.delivery.linkReady")}
        copyLabel={t("project.delivery.copy")}
        copiedLabel={t("project.delivery.copied")}
      >
        {missing > 0 && <p className="muted">{t("project.delivery.missing", { count: missing })}</p>}
      </LinkResult>

      {hasSessions && (
        <ul className="album-list">
          {(sessions.data ?? []).map((session) => (
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
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(session.id)}
                  >
                    {t("project.delivery.revoke")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {detailsFor && (
        <AccessDetailsModal
          title={t("access.details.title")}
          queryKey={["download-access", projectId, detailsFor]}
          load={() => getDownloadAccess(projectId, detailsFor)}
          urlFor={(token) => `${window.location.origin}/download/${token}`}
          defaultEmail={contact.email}
          onSend={async ({ email, language }) => {
            await sendDownloadInvitation(projectId, detailsFor, { email, language });
            await refresh();
          }}
          onClose={() => setDetailsFor(null)}
        />
      )}
    </section>
  );
}
