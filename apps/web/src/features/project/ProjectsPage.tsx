import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import type { ProjectType } from "@albumflow/contracts";
import { DEMO_STUDIO_ID, createProject, listProjects } from "../../lib/api";

const TYPES: { value: ProjectType; label: string }[] = [
  { value: "WEDDING", label: "Wedding" },
  { value: "BAPTISM", label: "Baptism" },
  { value: "EVENT", label: "Event" },
];

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<{ name: string; type: ProjectType; eventDate: string }>({
    name: "",
    type: "WEDDING",
    eventDate: "",
  });

  const projects = useQuery({
    queryKey: ["projects", DEMO_STUDIO_ID],
    queryFn: () => listProjects(DEMO_STUDIO_ID),
  });

  const create = useMutation({
    mutationFn: () =>
      createProject(DEMO_STUDIO_ID, {
        name: form.name,
        type: form.type,
        ...(form.eventDate ? { eventDate: new Date(form.eventDate).toISOString() } : {}),
      }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", DEMO_STUDIO_ID] });
      navigate(`/projects/${project.id}`);
    },
  });

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Shoots</h1>
          <p className="muted">Each shoot holds its own photos and albums.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel__head">
          <h2>New shoot</h2>
        </div>
        <form
          className="invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="field">
            <label htmlFor="project-name">Name</label>
            <input
              id="project-name"
              value={form.name}
              required
              placeholder="Elena & Radu"
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="project-type">Type</label>
            <select
              id="project-type"
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, type: event.target.value as ProjectType }))
              }
            >
              {TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="project-date">Event date</label>
            <input
              id="project-date"
              type="date"
              value={form.eventDate}
              onChange={(event) => setForm((prev) => ({ ...prev, eventDate: event.target.value }))}
            />
          </div>
          <button type="submit" className="button button--primary" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create shoot"}
          </button>
        </form>
        {create.isError && <p className="error">{(create.error as Error).message}</p>}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>All shoots</h2>
        </div>
        {projects.isLoading && <p className="muted">Loading…</p>}
        {projects.data?.length === 0 && (
          <p className="muted">No shoots yet — create one above to start uploading.</p>
        )}
        <ul className="album-list">
          {(projects.data ?? []).map((project) => (
            <li key={project.id}>
              <div>
                <Link to={`/projects/${project.id}`} className="album-list__title">
                  {project.name}
                </Link>
                <p className="muted">
                  {project.type.toLowerCase()}
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
