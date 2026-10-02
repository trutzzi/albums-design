import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getReviewAccess, listReviewSessions, openReviewSession, sendReviewInvitation } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { AccessDetailsModal } from "@/shared/ui/AccessDetailsModal";
import { PlanUpsell } from "@/shared/ui/PlanUpsell";

/**
 * Sending the album to the client for review: a link (optionally emailed), and the review
 * sessions so far. Stays mounted while another sidebar tab is open, so a link shown once
 * is still there on the way back.
 */
export function ReviewPanel({ albumId, hidden }: { albumId: string; hidden: boolean }) {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [emailLanguage, setEmailLanguage] = useState<"en" | "ro">(language);
  const [link, setLink] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [emailNote, setEmailNote] = useState<{ sentTo?: string; error?: string } | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);

  const reviews = useQuery({ queryKey: ["reviews", albumId], queryFn: () => listReviewSessions(albumId) });
  const share = useMutation({
    mutationFn: () =>
      openReviewSession(albumId, clientName || "Client", {
        ...(clientEmail.trim() ? { clientEmail: clientEmail.trim() } : {}),
        ...(sendEmail ? { sendEmail: true, language: emailLanguage } : {}),
      }),
    onSuccess: (session) => {
      setLink(`${window.location.origin}/review/${session.token}`);
      setPassword(session.password ?? null);
      setEmailNote(
        session.emailSentTo
          ? { sentTo: session.emailSentTo }
          : session.emailError
            ? { error: session.emailError }
            : null,
      );
      void queryClient.invalidateQueries({ queryKey: ["reviews", albumId] });
      void queryClient.invalidateQueries({ queryKey: ["album", albumId] });
    },
  });

  return (
    <>
      {!hidden && <PlanUpsell feature="watermark" />}
      <section className={`panel ${hidden ? "is-hidden" : ""}`}>
        <h2>{t("album.review.title")}</h2>
        <div className="field">
          <label htmlFor="client-name">{t("album.review.clientName")}</label>
          <input
            id="client-name"
            value={clientName}
            placeholder={t("album.review.clientName")}
            onChange={(event) => setClientName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="review-client-email">{t("client.email")}</label>
          <input
            id="review-client-email"
            type="email"
            value={clientEmail}
            placeholder={t("client.email.placeholder")}
            onChange={(event) => setClientEmail(event.target.value)}
          />
        </div>
        <div className="client-invite">
          <label>
            <input
              type="checkbox"
              checked={sendEmail}
              disabled={!clientEmail.trim()}
              onChange={(event) => setSendEmail(event.target.checked)}
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
        <button
          type="button"
          className="button button--primary"
          disabled={share.isPending}
          onClick={() => share.mutate()}
        >
          {share.isPending ? t("album.review.creating") : t("album.review.createLink")}
        </button>
        {emailNote?.sentTo && (
          <p className="notice notice--good" role="status">
            {t("client.send.done", { email: emailNote.sentTo })}
          </p>
        )}
        {emailNote?.error && (
          <p className="notice" role="alert">
            {t("client.notSent", { reason: emailNote.error })}
          </p>
        )}
        {link && (
          <p className="share-link">
            <a href={link}>{link}</a>
            {password && (
              <>
                <br />
                <span className="muted">{t("access.details.password")}: </span>
                <code className="access-modal__password">{password}</code>
              </>
            )}
          </p>
        )}
        {(reviews.data ?? []).map((session) => (
          <p key={session.id} className="muted">
            {t("album.review.session", { name: session.clientName, status: session.status })}
            {session.openComments > 0 && t("album.review.openComments", { count: session.openComments })}{" "}
            {session.passwordProtected && (
              <button type="button" className="button button--small" onClick={() => setDetailsFor(session.id)}>
                {t("access.details.open")}
              </button>
            )}
            {session.lastSentTo && (
              <>
                <br />
                {t("client.sentAt", {
                  email: session.lastSentTo,
                  date: new Date(session.lastSentAt ?? session.createdAt).toLocaleString(),
                })}
              </>
            )}
          </p>
        ))}
        {detailsFor && (
          <AccessDetailsModal
            title={t("access.details.title")}
            queryKey={["review-access", albumId, detailsFor]}
            load={() => getReviewAccess(albumId, detailsFor)}
            urlFor={(token) => `${window.location.origin}/review/${token}`}
            defaultEmail={clientEmail}
            onSend={async ({ email, language: emailIn }) => {
              await sendReviewInvitation(albumId, detailsFor, { email, language: emailIn });
              await queryClient.invalidateQueries({ queryKey: ["reviews", albumId] });
            }}
            onClose={() => setDetailsFor(null)}
          />
        )}
      </section>
    </>
  );
}
