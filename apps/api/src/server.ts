import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { getDatabase } from "@fauzet/database";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const localEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

const config = loadConfig();
const app = await createApp(config);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

async function shutdown(signal: string) {
  app.log.info({ signal }, "Graceful shutdown started");
  await app.close();
  await getDatabase().$disconnect();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
