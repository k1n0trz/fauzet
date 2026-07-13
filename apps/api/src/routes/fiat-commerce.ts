import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../domain/auth.js";
import {
  FiatCommerceError,
  type FiatCommerceService,
} from "../domain/fiat-commerce.js";

export async function registerFiatCommerceRoutes(
  app: FastifyInstance,
  auth: AuthService,
  fiat: FiatCommerceService,
) {
  app.get("/v1/fiat/catalog", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const session = await auth.authenticateSession(tokenFrom(request));
    try {
      return await fiat.catalog(session.user);
    } catch (error) {
      return send(error, reply);
    }
  });

  app.get("/v1/fiat/entitlements", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const session = await auth.authenticateSession(tokenFrom(request));
    try {
      return await fiat.inventory(session.user);
    } catch (error) {
      return send(error, reply);
    }
  });
}

function tokenFrom(request: FastifyRequest) {
  return (
    request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ??
    request.cookies.fz_session
  );
}

function send(error: unknown, reply: FastifyReply) {
  if (!(error instanceof FiatCommerceError)) throw error;
  return reply.code(error.statusCode).send({
    error: { code: error.code, message: error.message },
  });
}
