import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  idempotencyKeySchema,
  minerMutationRequestSchema,
  storePurchaseRequestSchema,
} from "@fauzet/contracts";
import type { AuthService } from "../domain/auth.js";
import {
  CommerceError,
  type MiningService,
  type StoreService,
} from "../domain/commerce.js";
import type { GameContext } from "../domain/games.js";

const minerParams = z.object({ id: z.string().uuid() });

export async function registerCommerceRoutes(
  app: FastifyInstance,
  auth: AuthService,
  store: StoreService,
  mining: MiningService,
  secret: string,
) {
  app.get("/v1/store/catalog", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const session = await auth.authenticateSession(tokenFrom(request));
    try {
      return await store.catalog(session.user);
    } catch (error) {
      return send(error, reply);
    }
  });
  app.post(
    "/v1/store/purchases",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const session = await auth.authenticateSession(tokenFrom(request));
      const body = storePurchaseRequestSchema.parse(request.body);
      const key = idempotencyKeySchema.parse(
        request.headers["idempotency-key"],
      );
      try {
        return await store.purchase(
          session.user,
          body.productId,
          body.configVersion,
          key,
          context(request, secret, session.context.deviceId),
        );
      } catch (error) {
        return send(error, reply);
      }
    },
  );
  app.get("/v1/mining/status", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const session = await auth.authenticateSession(tokenFrom(request));
    try {
      return await mining.status(session.user);
    } catch (error) {
      return send(error, reply);
    }
  });
  for (const type of ["UPGRADE", "REPAIR"] as const) {
    app.post(
      `/v1/miners/:id/${type.toLowerCase()}`,
      { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
      async (request, reply) => {
        reply.header("cache-control", "no-store");
        const session = await auth.authenticateSession(tokenFrom(request));
        const { id } = minerParams.parse(request.params);
        const { configVersion } = minerMutationRequestSchema.parse(
          request.body,
        );
        const key = idempotencyKeySchema.parse(
          request.headers["idempotency-key"],
        );
        try {
          return await mining.mutate(
            session.user,
            id,
            type,
            configVersion,
            key,
            context(request, secret, session.context.deviceId),
          );
        } catch (error) {
          return send(error, reply);
        }
      },
    );
  }
}

function tokenFrom(request: FastifyRequest) {
  return (
    request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ??
    request.cookies.fz_session
  );
}
function context(
  request: FastifyRequest,
  secret: string,
  bound?: string,
): GameContext {
  const supplied = request.headers["x-device-id"]?.toString();
  const deviceId =
    supplied &&
    UUID_V4.test(supplied) &&
    supplied.toLowerCase() === bound?.toLowerCase()
      ? supplied.toLowerCase()
      : undefined;
  return {
    ipHash: createHmac("sha256", secret)
      .update(`commerce-ip:${request.ip}`)
      .digest("hex"),
    ...(deviceId ? { deviceId } : {}),
  };
}
function send(error: unknown, reply: FastifyReply) {
  if (!(error instanceof CommerceError)) throw error;
  return reply.code(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
