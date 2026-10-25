import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getShootActivity, type DownloadSessionSummary, type PickSessionSummary } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { localeOf } from "@/shared/i18n/locale";
import { SkeletonText } from "@/shared/ui/Loading";
import type { ClientContact } from "@/features/project/hooks/useClientContact";
import { activityKey, relativeTime } from "@/features/project/lib/activity";
import { useSlideshowSessions } from "@/features/project/hooks/useSlideshowSessions";

/**
 * What sits beside a shoot's steps on a wide screen: who the client is, where each link
 * stands, and what happened lately — so the photographer never has to dig for it.
 */
export function ShootSidebar({
  projectId,
  contact,
  picks,
  downloads,
  linksState,
}: {
  projectId: string;
  contact: ClientContact;
  picks: PickSessionSummary[];
  downloads: DownloadSessionSummary[];
  /** The page's link queries are still loading, or failed — never shown as "Not sent yet". */
  linksState: "loading" | "error" | "ready";
}) {
  const { t, language } = useLanguage();
  const locale = localeOf(language);
  const activity = useQuery({
    queryKey: ["activity", projectId],
    queryFn: () => getShootActivity(projectId),
    refetchInterval: 30000,
  });
  // The same query the slideshow panel holds, so this costs no extra request.
  const slideshows = useSlideshowSessions(projectId);
  // When a link changes — created, sent, picked, downloaded — the timeline follows at once.
  const queryClient = useQueryClient();
  const linksSignature = [
    ...picks.map((session) => `${session.id}:${session.status}:${session.lastSentAt ?? ""}`),
    ...downloads.map((session) => `${session.id}:${session.status}:${session.downloadCount}`),
    ...(slideshows.data ?? []).map((session) => `${session.id}:${session.status}:${session.viewCount}`),
  ].join("|");
  // Only a change after everything has loaded counts: not the first load, nor each query arriving.
  const linksReady = linksState === "ready" && slideshows.isSuccess;
  const seenSignature = useRef<string | null>(null);
  useEffect(() => {
    if (!linksReady) return;
    if (seenSignature.current !== null && seenSignature.current !== linksSignature) {
      void queryClient.invalidateQueries({ queryKey: ["activity", projectId] });
    }
    seenSignature.current = linksSignature;
  }, [linksReady, linksSignature, projectId, queryClient]);
  const linksStatus =
    linksState === "ready" && slideshows.isError
      ? "error"
      : linksState === "ready" && slideshows.isLoading
        ? "loading"
        : linksState;

  const pick = picks[0];
  const download = downloads.find((session) => session.status === "ACTIVE") ?? downloads[0];
  const slideshow = (slideshows.data ?? []).find((session) => session.status === "ACTIVE");
  const initials = contact.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  return (
    <aside className="shoot__aside" aria-label={t("project.sidebar.label")}>
      <section className="shoot-side panel" aria-labelledby="side-client">
        <h2 id="side-client" className="shoot-side__title">
          {t("project.sidebar.client")}
        </h2>
        {contact.name || contact.email ? (
          <div className="shoot-side__client">
            <span className="shoot-side__avatar" aria-hidden="true">
              {initials || "·"}
            </span>
            <span className="shoot-side__who">
              <span className="shoot-side__name">{contact.name || contact.email}</span>
              {contact.name && contact.email && <span className="muted">{contact.email}</span>}
            </span>
          </div>
        ) : (
          <p className="muted">{t("project.sidebar.noClient")}</p>
        )}
      </section>

      <section className="shoot-side panel" aria-labelledby="side-links">
        <h2 id="side-links" className="shoot-side__title">
          {t("project.sidebar.links")}
        </h2>
        {linksStatus === "loading" && <SkeletonText lines={3} />}
        {linksStatus === "error" && <p className="muted">{t("project.sidebar.linksError")}</p>}
        {linksStatus === "ready" && (
          <dl className="shoot-side__links">
            <dt>{t("project.sidebar.selection")}</dt>
            <dd>
              {pick
                ? pick.status === "SUBMITTED"
                  ? t("project.sidebar.picksIn", { count: pick.pickedPhotoIds.length })
                  : t("project.sidebar.choosing")
                : t("project.sidebar.notSent")}
            </dd>
            <dt>{t("project.sidebar.download")}</dt>
            <dd>
              {download
                ? download.downloadCount > 0
                  ? t("project.sidebar.downloads", { count: download.downloadCount })
                  : t(`project.delivery.status.${download.status.toLowerCase()}`)
                : t("project.sidebar.notSent")}
            </dd>
            <dt>{t("project.sidebar.slideshow")}</dt>
            <dd>
              {slideshow ? t("project.sidebar.views", { count: slideshow.viewCount }) : t("project.sidebar.notSent")}
            </dd>
          </dl>
        )}
      </section>

      <section className="shoot-side panel" aria-labelledby="side-activity">
        <h2 id="side-activity" className="shoot-side__title">
          {t("project.sidebar.activity")}
        </h2>
        {activity.isLoading && <SkeletonText lines={3} />}
        {activity.isError && <p className="muted">{t("project.sidebar.activityError")}</p>}
        {activity.data && activity.data.length === 0 && <p className="muted">{t("project.sidebar.noActivity")}</p>}
        {activity.data && activity.data.length > 0 && (
          <ol className="shoot-side__activity">
            {activity.data.map((event, index) => (
              <li
                key={`${event.kind}-${event.at}-${index}`}
                className={`shoot-side__event shoot-side__event--${event.kind}`}
              >
                <span className="shoot-side__dot" aria-hidden="true" />
                <span>
                  {t(activityKey(event), { name: event.name ?? "", count: event.count ?? 0 })}{" "}
                  <time className="muted" dateTime={event.at}>
                    · {relativeTime(event.at, new Date(), locale)}
                  </time>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
