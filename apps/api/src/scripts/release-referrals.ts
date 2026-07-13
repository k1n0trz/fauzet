import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDatabase } from "@fauzet/database";
import { PrismaReferralStore } from "../infrastructure/prisma-referral-store.js";

const localEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

const database = getDatabase();
try {
  const limit = Number(
    process.argv.slice(2).find((value) => value !== "--") ?? 100,
  );
  const result = await new PrismaReferralStore(database).releaseDue(
    new Date(),
    limit,
  );
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
