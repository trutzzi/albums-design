import { eq } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { buildCompositionRoot } from "../src/composition-root";
import { photos as photoTable } from "../src/modules/media-ingestion/infrastructure/persistence/schema";

/**
 * Every photo uploaded before display derivatives existed still points the editor
 * at its full-resolution original. Those photos will never be re-uploaded, so they
 * need generating once, here.
 *
 *   pnpm --filter @albumflow/api backfill:derivatives
 */
async function main() {
  const root = buildCompositionRoot();

  const pending = await root.db
    .select({ id: photoTable.id })
    .from(photoTable)
    .where(eq(photoTable.hasDerivatives, false));

  console.log(`${pending.length} photo(s) without display copies.`);

  let done = 0;
  let skipped = 0;
  for (const row of pending) {
    const photo = await root.photos.findById(UniqueEntityId.create(row.id));
    // A photo whose bytes never arrived has nothing to shrink.
    if (!photo || photo.status === "PENDING_UPLOAD") {
      skipped += 1;
      continue;
    }

    const result = await root.generateDerivatives.execute({ photoId: row.id });
    if (result.isFailure) {
      // One unreadable file must not abandon the rest of the library.
      console.error(`  ${row.id}: ${result.getError().message}`);
      skipped += 1;
      continue;
    }

    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${pending.length}…`);
  }

  console.log(`Generated display copies for ${done} photo(s); skipped ${skipped}.`);
  await root.shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
