import { UniqueEntityId } from "@albumflow/domain-kernel";
import { loadDatabaseEnv } from "../src/shared-kernel/env";
import { createDatabase } from "../src/db/client";
import {
  DrizzleStudioMemberRepository,
  DrizzleStudioRepository,
  DrizzleSubscriptionRepository,
} from "../src/modules/identity/infrastructure/persistence/drizzle-studio-repository";
import { DrizzleProjectRepository } from "../src/modules/media-ingestion/infrastructure/persistence/drizzle-project-repository";
import { Studio } from "../src/modules/identity/domain/studio";
import { StudioMember } from "../src/modules/identity/domain/studio-member";
import { Subscription } from "../src/modules/identity/domain/subscription";
import { Project } from "../src/modules/media-ingestion/domain/project";

const DEMO_STUDIO_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_PROJECT_ID = "22222222-2222-4222-8222-222222222222";

async function main() {
  const env = loadDatabaseEnv();
  const { db, close } = createDatabase(env.DATABASE_URL);

  const studios = new DrizzleStudioRepository(db);
  const subscriptions = new DrizzleSubscriptionRepository(db);
  const members = new DrizzleStudioMemberRepository(db);
  const projects = new DrizzleProjectRepository(db);

  const { studio, apiKey } = Studio.create(
    { name: "Golden Hour Photography", ownerEmail: "studio@example.com" },
    UniqueEntityId.create(DEMO_STUDIO_ID),
  );
  await studios.save(studio);

  const subscription = Subscription.startTrial(studio.id);
  subscription.changePlan("STUDIO");
  await subscriptions.save(subscription);

  await members.save(
    StudioMember.invite({
      studioId: studio.id,
      email: studio.ownerEmail,
      name: "Studio Owner",
      role: "OWNER",
    }),
  );

  const project = Project.create(
    {
      studioId: studio.id,
      name: "Demo shoot (sample data)",
      type: "WEDDING",
      eventDate: new Date("2026-06-20"),
    },
    UniqueEntityId.create(DEMO_PROJECT_ID),
  );
  await projects.save(project);

  console.log("Seeded demo studio and project:");
  console.log(`  studioId:  ${studio.id.toString()}`);
  console.log(`  projectId: ${project.id.toString()}`);
  console.log(`  apiKey:    ${apiKey}`);
  console.log("\nPut the API key in apps/web/.env as VITE_STUDIO_API_KEY to use the studio app.");

  await close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
