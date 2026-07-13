import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  gameCompleteRequestSchema,
  gameEventRequestSchema,
  gameSlugSchema,
  idempotencyKeySchema,
} from "@fauzet/contracts";
import type { AuthService } from "../domain/auth.js";
import {
  GameError,
  type GameContext,
  type GameService,
} from "../domain/games.js";

const gameParamsSchema = z.object({ game: gameSlugSchema });
const sessionParamsSchema = gameParamsSchema.extend({
  sessionId: z.string().uuid(),
});
const recoveryParamsSchema = z.object({ sessionId: z.string().uuid() });

export async function registerGameRoutes(
  app: FastifyInstance,
  auth: AuthService,
  games: GameService,
  contextSecret: string,
) {
  app.get("/v1/games/catalog", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const session = await auth.authenticateSession(tokenFrom(request));
    try {
      return await games.catalog(
        session.user,
        requestContext(request, contextSecret, session.context.deviceId),
      );
    } catch (error) {
      return sendGameError(error, reply);
    }
  });

  app.post(
    "/v1/games/:game/sessions",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const session = await auth.authenticateSession(tokenFrom(request));
      const { game } = gameParamsSchema.parse(request.params);
      const idempotencyKey = idempotencyKeySchema.parse(
        request.headers["idempotency-key"],
      );
      try {
        const result = await games.createSession(
          session.user,
          game,
          idempotencyKey,
          requestContext(request, contextSecret, session.context.deviceId),
        );
        return reply.code(result.replayed ? 200 : 201).send(result);
      } catch (error) {
        return sendGameError(error, reply);
      }
    },
  );

  app.get("/v1/games/sessions/:sessionId", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const session = await auth.authenticateSession(tokenFrom(request));
    const { sessionId } = recoveryParamsSchema.parse(request.params);
    const sessionToken = z
      .string()
      .min(80)
      .max(256)
      .parse(request.headers["x-game-session-token"]);
    try {
      return await games.getSession(
        session.user,
        sessionId,
        sessionToken,
        requestContext(request, contextSecret, session.context.deviceId),
      );
    } catch (error) {
      return sendGameError(error, reply);
    }
  });

  app.post(
    "/v1/games/:game/sessions/:sessionId/events",
    { config: { rateLimit: { max: 180, timeWindow: "1 minute" } } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const session = await auth.authenticateSession(tokenFrom(request));
      const { game, sessionId } = sessionParamsSchema.parse(request.params);
      const event = gameEventRequestSchema.parse(request.body);
      try {
        return await games.recordEvent(
          session.user,
          game,
          sessionId,
          event,
          requestContext(request, contextSecret, session.context.deviceId),
        );
      } catch (error) {
        return sendGameError(error, reply);
      }
    },
  );

  app.post(
    "/v1/games/:game/sessions/:sessionId/complete",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const session = await auth.authenticateSession(tokenFrom(request));
      const { game, sessionId } = sessionParamsSchema.parse(request.params);
      const { sessionToken } = gameCompleteRequestSchema.parse(request.body);
      const idempotencyKey = idempotencyKeySchema.parse(
        request.headers["idempotency-key"],
      );
      try {
        return await games.complete(
          session.user,
          game,
          sessionId,
          sessionToken,
          idempotencyKey,
          requestContext(request, contextSecret, session.context.deviceId),
        );
      } catch (error) {
        return sendGameError(error, reply);
      }
    },
  );
}

function tokenFrom(request: FastifyRequest): string | undefined {
  return (
    request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ??
    request.cookies.fz_session
  );
}

function requestContext(
  request: FastifyRequest,
  secret: string,
  boundDeviceId: string | undefined,
): GameContext {
  const supplied = request.headers["x-device-id"]?.toString();
  const deviceId =
    supplied &&
    UUID_V4.test(supplied) &&
    supplied.toLowerCase() === boundDeviceId?.toLowerCase()
      ? supplied.toLowerCase()
      : undefined;
  return {
    ipHash: createHmac("sha256", secret)
      .update(`games-ip:${request.ip}`)
      .digest("hex"),
    ...(deviceId ? { deviceId } : {}),
  };
}

function sendGameError(error: unknown, reply: FastifyReply) {
  if (!(error instanceof GameError)) {
    throw error;
  }
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
