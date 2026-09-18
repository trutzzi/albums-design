import { desc, eq } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "../../../../db/client";
import type { ProjectRepository } from "../../domain/project-repository";
import { Project } from "../../domain/project";
import { projects } from "./schema";

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database) {}

  async save(project: Project): Promise<void> {
    await this.db
      .insert(projects)
      .values({
        id: project.id.toString(),
        studioId: project.studioId.toString(),
        name: project.name,
        type: project.type,
        eventDate: project.eventDate,
        createdAt: project.createdAt,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: { name: project.name, eventDate: project.eventDate },
      });
  }

  async listByStudioId(studioId: UniqueEntityId): Promise<Project[]> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.studioId, studioId.toString()))
      .orderBy(desc(projects.createdAt));
    return rows.map(toDomain);
  }

  async findById(id: UniqueEntityId): Promise<Project | undefined> {
    const [row] = await this.db.select().from(projects).where(eq(projects.id, id.toString())).limit(1);
    return row ? toDomain(row) : undefined;
  }

  async delete(id: UniqueEntityId): Promise<void> {
    await this.db.delete(projects).where(eq(projects.id, id.toString()));
  }
}

function toDomain(row: typeof projects.$inferSelect): Project {
  return Project.reconstitute(
    {
      studioId: UniqueEntityId.create(row.studioId),
      name: row.name,
      type: row.type,
      eventDate: row.eventDate ?? undefined,
      createdAt: row.createdAt,
    },
    UniqueEntityId.create(row.id),
  );
}
