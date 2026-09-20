import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import type { ProjectSummaryDTO, ProjectType } from "@albumflow/contracts";
import { createProject, listProjects } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import { useLanguage } from "../../lib/i18n/LanguageContext";

const TYPES: { value: ProjectType; labelKey: string }[] = [
  { value: "WEDDING", labelKey: "projects.new.type.wedding" },
  { value: "BAPTISM", labelKey: "projects.new.type.baptism" },
  { value: "EVENT", labelKey: "projects.new.type.event" },
];

/** A search box only earns its place once the list is long enough to scan. */
const SEARCHABLE_FROM = 6;

export function ProjectsPage() {
  const { studioId } = useAuth();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<{
    name: string;
    type: ProjectType;
    eventDate: string;
    clientName: string;
    clientEmail: string;
  }>({ name: "", type: "WEDDING", eventDate: "", clientName: "", clientEmail: "" });
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");

  const projects = useQuery({
    queryKey: ["projects", studioId],
    queryFn: () => listProjects(studioId),
  });

  const create = useMutation({
    mutationFn: () =>
      createProject(studioId, {
        name: form.name,
        type: form.type,
        ...(form.eventDate ? { eventDate: new Date(form.eventDate).toISOString() } : {}),
        ...(form.clientName.trim() ? { clientName: form.clientName.trim() } : {}),
        ...(form.clientEmail.trim() ? { clientEmail: form.clientEmail.trim() } : {}),
      }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", studioId] });
      navigate(`/projects/${project.id}`);
    },
  });

  const typeLabel = (type: ProjectType) =>
    t(TYPES.find((option) => option.value === type)?.labelKey ?? type);
  const locale = language === "ro" ? "ro-RO" : "en-GB";
  /**
   * "1 album" but "5 albums" — and Romanian needs a third form from twenty up
   * ("20 de albume"), which is exactly where a card reads wrong if you ignore it.
   */
  const countLabel = (count: number, base: string) => {
    if (count === 1) return t(`${base}.one`, { count });
    const lastTwo = count % 100;
    const many = language === "ro" && (lastTwo === 0 || lastTwo >= 20);
    return t(many ? `${base}.many` : `${base}.other`, { count: count.toLocaleString(locale) });
  };
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  const all = projects.data ?? [];
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((project) =>
      [project.name, project.clientName ?? "", typeLabel(project.type)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [all, search]);

  const newShootForm = (
    <form
      className="shoot-form"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <div className="field">
        <label htmlFor="project-name">{t("projects.new.name")}</label>
        <input
          id="project-name"
          value={form.name}
          required
          autoFocus
          placeholder={t("projects.new.namePlaceholder")}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        />
      </div>
      <div className="field">
        <label htmlFor="project-type">{t("projects.new.type")}</label>
        <select
          id="project-type"
          value={form.type}
          onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as ProjectType }))}
        >
          {TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="project-date">{t("projects.new.eventDate")}</label>
        <input
          id="project-date"
          type="date"
          value={form.eventDate}
          onChange={(event) => setForm((prev) => ({ ...prev, eventDate: event.target.value }))}
        />
      </div>
      {/* Asked once here so every client link later fills itself in. */}
      <div className="field">
        <label htmlFor="project-client">{t("projects.new.clientName")}</label>
        <input
          id="project-client"
          value={form.clientName}
          placeholder={t("projects.new.clientNamePlaceholder")}
          onChange={(event) => setForm((prev) => ({ ...prev, clientName: event.target.value }))}
        />
      </div>
      <div className="field">
        <label htmlFor="project-client-email">{t("client.email")}</label>
        <input
          id="project-client-email"
          type="email"
          value={form.clientEmail}
          placeholder={t("client.email.placeholder")}
          onChange={(event) => setForm((prev) => ({ ...prev, clientEmail: event.target.value }))}
        />
      </div>
      <button type="submit" className="button button--primary" disabled={create.isPending}>
        {create.isPending ? t("projects.new.submitting") : t("projects.new.submit")}
      </button>
    </form>
  );

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>{t("projects.title")}</h1>
          <p className="muted">
            {all.length > 0 ? t("projects.subtitleCount", { count: all.length }) : t("projects.subtitle")}
          </p>
        </div>
        <div className="page__header-actions">
          {all.length >= SEARCHABLE_FROM && (
            <input
              type="search"
              className="shoot-search"
              value={search}
              placeholder={t("projects.search")}
              aria-label={t("projects.search")}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
          <button type="button" className="button button--primary" onClick={() => setAdding((open) => !open)}>
            {adding ? t("common.cancel") : t("projects.new.open")}
          </button>
        </div>
      </header>

      {adding && (
        <section className="panel">
          <div className="panel__head">
            <h2>{t("projects.new.title")}</h2>
          </div>
          {newShootForm}
          {create.isError && <p className="error">{(create.error as Error).message}</p>}
        </section>
      )}

      {projects.isLoading && <p className="muted">{t("common.loading")}</p>}

      {!projects.isLoading && all.length === 0 && !adding && (
        <section className="panel shoot-empty">
          <h2>{t("projects.empty.title")}</h2>
          <p className="muted">{t("projects.empty.body")}</p>
          <button type="button" className="button button--primary" onClick={() => setAdding(true)}>
            {t("projects.empty.cta")}
          </button>
        </section>
      )}

      {all.length > 0 && visible.length === 0 && <p className="muted">{t("projects.search.none")}</p>}

      <div className="shoot-grid">
        {visible.map((project: ProjectSummaryDTO) => (
          <Link key={project.id} to={`/projects/${project.id}`} className="shoot-card">
            <div className="shoot-card__cover">
              {project.coverThumbnailUrl ? (
                <img src={project.coverThumbnailUrl} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="shoot-card__empty-cover" aria-hidden="true">
                  📷
                </span>
              )}
              <span className="shoot-card__type">{typeLabel(project.type)}</span>
            </div>
            <div className="shoot-card__body">
              <h3>{project.name}</h3>
              {project.clientName && <p className="shoot-card__client">{project.clientName}</p>}
              <p className="muted shoot-card__meta">
                {project.photoCount > 0
                  ? countLabel(project.photoCount, "projects.card.photos")
                  : t("projects.card.noPhotos")}
                {project.albumCount > 0 && ` · ${countLabel(project.albumCount, "projects.card.albums")}`}
              </p>
              <p className="muted shoot-card__date">
                {project.eventDate ? formatDate(project.eventDate) : t("projects.card.created", { date: formatDate(project.createdAt) })}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
