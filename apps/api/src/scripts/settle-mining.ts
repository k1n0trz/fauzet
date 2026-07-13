import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDatabase } from "@fauzet/database";
import { PrismaMiningSettlement } from "../infrastructure/prisma-mining-settlement.js";

const localEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

const database = getDatabase();

try {
  const cliArguments = process.argv.slice(2).filter((value) => value !== "--");
  if (cliArguments.length > 1)
    throw new Error("Usage: settle-mining [YYYY-MM-DD]");
  const period = parsePeriod(cliArguments[0] ?? yesterdayUtc());
  const result = await new PrismaMiningSettlement(database).settle(period);
  console.log(JSON.stringify(result));
  if (result.status === "BLOCKED") process.exitCode = 2;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}

function parsePeriod(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Usage: settle-mining [YYYY-MM-DD]");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Mining settlement period must be a real UTC date");
  }
  return date;
}

function yesterdayUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  )
    .toISOString()
    .slice(0, 10);
}
