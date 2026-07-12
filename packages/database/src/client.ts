import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;

export function getDatabase(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}
