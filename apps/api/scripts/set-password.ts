import { loadDatabaseEnv } from "../src/shared-kernel/env";
import { createDatabase } from "../src/db/client";
import { DrizzleStudioMemberRepository } from "../src/modules/identity/infrastructure/persistence/drizzle-studio-repository";
import { hashPassword } from "../src/shared-kernel/password-hasher";

// One-off admin tool: gives an existing (invite-only, passwordless) studio
// member real login credentials, without going through /auth/register.
// Needed once the frontend started requiring login for every studio, so a
// studio that was originally set up via `db:seed`/the API-key flow can still
// sign in. Run against the target database:
//   DATABASE_URL=... npx tsx apps/api/scripts/set-password.ts --email a@b.com --password 'xxxx'
async function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    const flag = process.argv[i];
    const value = process.argv[i + 1];
    if (flag && value) args.set(flag.replace(/^--/, ""), value);
  }
  const email = args.get("email");
  const password = args.get("password");
  if (!email || !password) {
    console.error("Usage: set-password.ts --email <email> --password <password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const env = loadDatabaseEnv();
  const { db, close } = createDatabase(env.DATABASE_URL);
  const members = new DrizzleStudioMemberRepository(db);

  const member = await members.findByEmail(email.trim().toLowerCase());
  if (!member) {
    console.error(`No studio member found with email ${email}`);
    await close();
    process.exit(1);
  }

  member.setPassword(await hashPassword(password));
  await members.save(member);

  console.log(`Password set for ${member.email} (studio ${member.studioId.toString()}).`);
  console.log("They can now log in at /login with this email and password.");

  await close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
