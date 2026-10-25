import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ShootActivityUseCase } from "../../application/use-cases/shoot-activity.use-case";

const projectParams = z.object({ projectId: z.string().uuid() });

/** The shoot page's activity sidebar. Studio side: authenticated and tenancy-guarded through :projectId. */
export function registerActivityRoutes(app: FastifyInstance, deps: { shootActivity: ShootActivityUseCase }): void {
  app.get("/projects/:projectId/activity", async (request) => {
    const { projectId } = projectParams.parse(request.params);
    return deps.shootActivity.execute(projectId);
  });
}
