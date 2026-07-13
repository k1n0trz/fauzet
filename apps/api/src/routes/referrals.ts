import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../domain/auth.js";
import { ReferralError, type ReferralService } from "../domain/referrals.js";

export async function registerReferralRoutes(
  app: FastifyInstance,
  auth: AuthService,
  referrals: ReferralService,
) {
  app.get("/v1/referrals/code", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const user = await auth.authenticate(tokenFrom(request));
    try {
      return await referrals.code(user);
    } catch (error) {
      return send(error, reply);
    }
  });
  app.get("/v1/referrals/tree", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const user = await auth.authenticate(tokenFrom(request));
    try {
      return await referrals.tree(user);
    } catch (error) {
      return send(error, reply);
    }
  });
  app.get("/v1/referrals/commissions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const user = await auth.authenticate(tokenFrom(request));
    try {
      return await referrals.commissions(user);
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
  if (!(error instanceof ReferralError)) throw error;
  return reply.code(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}
