import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import type { ProjectType } from "@albumflow/contracts";
import { createProject, listProjects } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import { useLanguage } from "../../lib/i18n/LanguageContext";

const TYPES: { value: ProjectType; labelKey: string }[] = [
  { value: "WEDDING", labelKey: "projects.new.type.wedding" },
  { value: "BAPTISM", labelKey: "projects.new.type.baptism" },
  { value: "EVENT", labelKey: "projects.new.type.event" },
];

export function ProjectsPage() {
  const { studioId } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<{ name: string; type: ProjectType; eventDate: string }>({
    name: "",
    type: "WEDDING",
    eventDate: "",
  });

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
      }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", studioId] });
      navigate(`/projects/${project.id}`);
    },
  });

  const typeLabel = (type: ProjectType) =>
    t(TYPES.find((option) => option.value === type)?.labelKey ?? type);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>{t("projects.title")}</h1>
          <p className="muted">{t("projects.subtitle")}</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel__head">
          <h2>{t("projects.new.title")}</h2>
        </div>
        <form
          className="invite-form"
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
              placeholder={t("projects.new.namePlaceholder")}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="project-type">{t("projects.new.type")}</label>
            <select
              id="project-type"
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, type: event.target.value as ProjectType }))
              }
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
          <button type="submit" className="button button--primary" disabled={create.isPending}>
            {create.isPending ? t("projects.new.submitting") : t("projects.new.submit")}
          </button>
        </form>
        {create.isError && <p className="error">{(create.error as Error).message}</p>}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>{t("projects.all.title")}</h2>
        </div>
        {projects.isLoading && <p className="muted">{t("common.loading")}</p>}
        {projects.data?.length === 0 && <p className="muted">{t("projects.all.empty")}</p>}
        <ul className="album-list">
          {(projects.data ?? []).map((project) => (
            <li key={project.id}>
              <div>
                <Link to={`/projects/${project.id}`} className="album-list__title">
                  {project.name}
                </Link>
                <p className="muted">
                  {typeLabel(project.type)}
                  {project.eventDate &&
                    ` · ${new Date(project.eventDate).toLocaleDateString()}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
