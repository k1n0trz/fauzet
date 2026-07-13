import {
  accountActivityQuerySchema,
  accountActivityResponseSchema,
} from "@fauzet/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AccountActivityService } from "../domain/account-activity.js";
import type { AuthService } from "../domain/auth.js";

function tokenFrom(request: FastifyRequest) {
  return (
    request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ??
    request.cookies.fz_session
  );
}

export async function registerAccountActivityRoutes(
  app: FastifyInstance,
  auth: AuthService,
  activity: AccountActivityService,
) {
  app.get("/v1/account/activity", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const user = await auth.authenticate(tokenFrom(request));
    const query = accountActivityQuerySchema.parse(request.query);
    return accountActivityResponseSchema.parse(
      await activity.list(user.id, query),
    );
  });
}
